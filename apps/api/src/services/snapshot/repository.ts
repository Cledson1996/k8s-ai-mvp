import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  ClusterSnapshot,
  DeploymentAnalysisResponse,
  ResourceDetail,
  ResourceHistoryEntry,
  SnapshotDiff,
  SnapshotSummary
} from "@k8s-ai-mvp/shared";

export interface StoredSnapshot {
  snapshot: ClusterSnapshot;
  detailsByKey: Record<string, ResourceDetail>;
}

interface SnapshotRow {
  id: string;
  cluster_name: string;
  collected_at: string;
  resource_count: number;
  issue_count: number;
  data: string;
}

interface ResourceVersionRow {
  snapshot_id: string;
  collected_at: string;
  resource_key: string;
  kind: string;
  namespace: string | null;
  name: string;
  status: string;
  hash: string;
  data: string;
}

export class SnapshotRepository {
  private readonly db: DatabaseSync;

  constructor(sqlitePath: string) {
    mkdirSync(dirname(sqlitePath), { recursive: true });
    this.db = new DatabaseSync(sqlitePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        cluster_name TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        resource_count INTEGER NOT NULL,
        issue_count INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resource_versions (
        snapshot_id TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        resource_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        namespace TEXT,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        hash TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (snapshot_id, resource_key)
      );
      CREATE INDEX IF NOT EXISTS idx_resource_versions_key
      ON resource_versions(resource_key, collected_at DESC);
      CREATE TABLE IF NOT EXISTS snapshot_relations (
        snapshot_id TEXT NOT NULL,
        from_key TEXT NOT NULL,
        to_key TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        label TEXT NOT NULL,
        PRIMARY KEY (snapshot_id, from_key, to_key, relation_type)
      );
      CREATE TABLE IF NOT EXISTS deployment_analyses (
        deployment_key TEXT PRIMARY KEY,
        namespace TEXT NOT NULL,
        name TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
    `);
  }

  save(storedSnapshot: StoredSnapshot): StoredSnapshot {
    const snapshotId = storedSnapshot.snapshot.id || randomUUID();
    const snapshot = {
      ...storedSnapshot.snapshot,
      id: snapshotId
    };
    const payload = JSON.stringify({
      snapshot,
      detailsByKey: storedSnapshot.detailsByKey
    });

    const insertSnapshot = this.db.prepare(`
      INSERT OR REPLACE INTO snapshots (
        id, cluster_name, collected_at, resource_count, issue_count, data
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertSnapshot.run(
      snapshot.id,
      snapshot.clusterName,
      snapshot.collectedAt,
      snapshot.resources.length,
      snapshot.issues.length,
      payload
    );

    const deleteVersions = this.db.prepare("DELETE FROM resource_versions WHERE snapshot_id = ?");
    deleteVersions.run(snapshot.id);
    const insertVersion = this.db.prepare(`
      INSERT INTO resource_versions (
        snapshot_id, collected_at, resource_key, kind, namespace, name, status, hash, data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const resource of snapshot.resources) {
      const detail = storedSnapshot.detailsByKey[resource.key];
      insertVersion.run(
        snapshot.id,
        snapshot.collectedAt,
        resource.key,
        resource.kind,
        resource.namespace ?? null,
        resource.name,
        resource.status,
        stableHash(detail ?? resource),
        JSON.stringify(detail ?? resource)
      );
    }

    const deleteRelations = this.db.prepare("DELETE FROM snapshot_relations WHERE snapshot_id = ?");
    deleteRelations.run(snapshot.id);
    const insertRelation = this.db.prepare(`
      INSERT INTO snapshot_relations (snapshot_id, from_key, to_key, relation_type, label)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const relation of snapshot.relations) {
      insertRelation.run(snapshot.id, relation.fromKey, relation.toKey, relation.type, relation.label);
    }

    return {
      snapshot,
      detailsByKey: storedSnapshot.detailsByKey
    };
  }

  getLatest(): StoredSnapshot | undefined {
    const row = this.db
      .prepare("SELECT data FROM snapshots ORDER BY collected_at DESC LIMIT 1")
      .get() as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as StoredSnapshot) : undefined;
  }

  getSnapshot(id: string): StoredSnapshot | undefined {
    const row = this.db
      .prepare("SELECT data FROM snapshots WHERE id = ?")
      .get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as StoredSnapshot) : undefined;
  }

  getDeploymentAnalysis(
    deploymentKey: string,
  ): DeploymentAnalysisResponse | undefined {
    const row = this.db
      .prepare("SELECT data FROM deployment_analyses WHERE deployment_key = ?")
      .get(deploymentKey) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as DeploymentAnalysisResponse) : undefined;
  }

  saveDeploymentAnalysis(analysis: DeploymentAnalysisResponse) {
    this.db
      .prepare(
        `
        INSERT OR REPLACE INTO deployment_analyses (
          deployment_key, namespace, name, generated_at, data
        ) VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        analysis.deployment.key,
        analysis.deployment.namespace,
        analysis.deployment.name,
        analysis.generatedAt,
        JSON.stringify(analysis),
      );
  }

  deleteDeploymentAnalysis(deploymentKey: string) {
    this.db
      .prepare("DELETE FROM deployment_analyses WHERE deployment_key = ?")
      .run(deploymentKey);
  }

  listSnapshots(): SnapshotSummary[] {
    const rows = this.db
      .prepare(`
        SELECT id, cluster_name, collected_at, resource_count, issue_count
        FROM snapshots
        ORDER BY collected_at DESC
      `)
      .all() as unknown as SnapshotRow[];

    return rows.map((row) => ({
      id: row.id,
      clusterName: row.cluster_name,
      collectedAt: row.collected_at,
      resourceCount: row.resource_count,
      issueCount: row.issue_count
    }));
  }

  getPreviousSnapshot(id: string): SnapshotSummary | undefined {
    const current = this.db
      .prepare("SELECT collected_at FROM snapshots WHERE id = ?")
      .get(id) as { collected_at: string } | undefined;
    if (!current) {
      return undefined;
    }

    const row = this.db
      .prepare(`
        SELECT id, cluster_name, collected_at, resource_count, issue_count
        FROM snapshots
        WHERE collected_at < ?
        ORDER BY collected_at DESC
        LIMIT 1
      `)
      .get(current.collected_at) as SnapshotRow | undefined;

    return row
      ? {
          id: row.id,
          clusterName: row.cluster_name,
          collectedAt: row.collected_at,
          resourceCount: row.resource_count,
          issueCount: row.issue_count
        }
      : undefined;
  }

  listResourceHistory(resourceKey: string): ResourceHistoryEntry[] {
    const rows = this.db
      .prepare(`
        SELECT snapshot_id, collected_at, resource_key, kind, namespace, name, status, hash, data
        FROM resource_versions
        WHERE resource_key = ?
        ORDER BY collected_at ASC
      `)
      .all(resourceKey) as unknown as ResourceVersionRow[];

    if (rows.length === 0) {
      return [];
    }

    const history: ResourceHistoryEntry[] = [];
    let previous: ResourceVersionRow | undefined;

    for (const row of rows) {
      if (!previous) {
        history.push({
          resourceKey: row.resource_key,
          snapshotId: row.snapshot_id,
          collectedAt: row.collected_at,
          changeType: "added",
          kind: row.kind as ResourceHistoryEntry["kind"],
          namespace: row.namespace ?? undefined,
          name: row.name,
          currentStatus: row.status,
          summary: `${row.kind} ${row.namespace ? `${row.namespace}/` : ""}${row.name} apareceu no histórico local.`
        });
      } else {
        if (previous.status !== row.status) {
          history.push({
            resourceKey: row.resource_key,
            snapshotId: row.snapshot_id,
            collectedAt: row.collected_at,
            changeType: "status_changed",
            kind: row.kind as ResourceHistoryEntry["kind"],
            namespace: row.namespace ?? undefined,
            name: row.name,
            previousStatus: previous.status,
            currentStatus: row.status,
            summary: `Status mudou de ${previous.status} para ${row.status}.`
          });
        } else if (previous.hash !== row.hash) {
          history.push({
            resourceKey: row.resource_key,
            snapshotId: row.snapshot_id,
            collectedAt: row.collected_at,
            changeType: "spec_changed",
            kind: row.kind as ResourceHistoryEntry["kind"],
            namespace: row.namespace ?? undefined,
            name: row.name,
            previousStatus: previous.status,
            currentStatus: row.status,
            summary: "Foi detectada mudança relevante na configuração do recurso."
          });
        }
      }

      previous = row;
    }

    return history.reverse();
  }

  diffSnapshots(snapshotId: string, previousSnapshotId: string): SnapshotDiff | undefined {
    const currentRows = this.db
      .prepare(`
        SELECT snapshot_id, collected_at, resource_key, kind, namespace, name, status, hash, data
        FROM resource_versions
        WHERE snapshot_id = ?
      `)
      .all(snapshotId) as unknown as ResourceVersionRow[];
    const previousRows = this.db
      .prepare(`
        SELECT snapshot_id, collected_at, resource_key, kind, namespace, name, status, hash, data
        FROM resource_versions
        WHERE snapshot_id = ?
      `)
      .all(previousSnapshotId) as unknown as ResourceVersionRow[];

    if (currentRows.length === 0 || previousRows.length === 0) {
      return undefined;
    }

    const currentMap = new Map(currentRows.map((row) => [row.resource_key, row]));
    const previousMap = new Map(previousRows.map((row) => [row.resource_key, row]));
    const added: ResourceHistoryEntry[] = [];
    const removed: ResourceHistoryEntry[] = [];
    const changed: ResourceHistoryEntry[] = [];

    for (const row of currentRows) {
      const previous = previousMap.get(row.resource_key);
      if (!previous) {
        added.push(toHistoryEntry(row, "added", `${row.kind} ${renderName(row)} apareceu na coleta atual.`));
        continue;
      }

      if (previous.status !== row.status) {
        changed.push({
          ...toHistoryEntry(row, "status_changed", `Status mudou de ${previous.status} para ${row.status}.`),
          previousStatus: previous.status,
          currentStatus: row.status
        });
      } else if (previous.hash !== row.hash) {
        changed.push({
          ...toHistoryEntry(row, "spec_changed", "Configuração mudou em relação ao snapshot anterior."),
          previousStatus: previous.status,
          currentStatus: row.status
        });
      }
    }

    for (const row of previousRows) {
      if (!currentMap.has(row.resource_key)) {
        removed.push(toHistoryEntry(row, "removed", `${row.kind} ${renderName(row)} não apareceu na coleta atual.`));
      }
    }

    return {
      snapshotId,
      previousSnapshotId,
      collectedAt: currentRows[0].collected_at,
      previousCollectedAt: previousRows[0].collected_at,
      added,
      removed,
      changed
    };
  }
}

function stableHash(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

function renderName(row: ResourceVersionRow): string {
  return row.namespace ? `${row.namespace}/${row.name}` : row.name;
}

function toHistoryEntry(
  row: ResourceVersionRow,
  changeType: ResourceHistoryEntry["changeType"],
  summary: string
): ResourceHistoryEntry {
  return {
    resourceKey: row.resource_key,
    snapshotId: row.snapshot_id,
    collectedAt: row.collected_at,
    changeType,
    kind: row.kind as ResourceHistoryEntry["kind"],
    namespace: row.namespace ?? undefined,
    name: row.name,
    currentStatus: row.status,
    summary
  };
}
