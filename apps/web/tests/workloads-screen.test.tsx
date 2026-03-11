import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkloadsScreen } from "../components/screens/workloads-screen";

const sampleCards = [
  {
    kind: "Pod",
    label: "Pods",
    total: 10,
    statuses: [
      { status: "Running", count: 7 },
      { status: "Failed", count: 2 },
      { status: "Pending", count: 1 },
    ],
  },
  {
    kind: "Deployment",
    label: "Deployments",
    total: 4,
    statuses: [{ status: "Running", count: 4 }],
  },
];

const samplePods = [
  {
    name: "my-app-abc-123",
    namespace: "production",
    phase: "Running",
    nodeName: "worker-1",
    restarts: 0,
    ready: true,
    cpuCores: 0.05,
    memoryBytes: 64 * 1024 * 1024,
    age: "2d",
    controllerKind: "Deployment",
    controllerName: "my-app",
    events: [
      {
        type: "Normal",
        reason: "Started",
        message: "Container started successfully",
        count: 1,
        lastSeen: "2h ago",
      },
    ],
  },
];

describe("WorkloadsScreen", () => {
  it("renders all workload cards", () => {
    render(
      <WorkloadsScreen
        cards={sampleCards}
        pods={samplePods}
        degradedSources={[]}
      />,
    );

    expect(screen.getByText("Pods")).toBeInTheDocument();
    expect(screen.getByText("Deployments")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows pods table when Pod card is clicked", async () => {
    render(
      <WorkloadsScreen
        cards={sampleCards}
        pods={samplePods}
        degradedSources={[]}
      />,
    );

    const button = screen.getByText("Ver tabela →");
    await userEvent.click(button);

    expect(screen.getByText("my-app-abc-123")).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
  });

  it("shows events modal when Eventos button is clicked", async () => {
    render(
      <WorkloadsScreen
        cards={sampleCards}
        pods={samplePods}
        degradedSources={[]}
      />,
    );

    // open pods table first
    await userEvent.click(screen.getByText("Ver tabela →"));

    // then click eventos
    await userEvent.click(screen.getByText("Eventos"));

    expect(screen.getByText("Eventos do pod")).toBeInTheDocument();
    expect(
      screen.getByText("Container started successfully"),
    ).toBeInTheDocument();
  });
});
