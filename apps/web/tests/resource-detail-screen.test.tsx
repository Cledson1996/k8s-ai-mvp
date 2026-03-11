import { render, screen } from "@testing-library/react";
import { ResourceDetailScreen } from "../components/screens/resource-detail-screen";
import { sampleResourceDetails } from "../lib/sample-data";

describe("ResourceDetailScreen", () => {
  it("renders deployment-centric operational sections with richer detail", () => {
    render(
      <ResourceDetailScreen detail={sampleResourceDetails[0]} degradedSources={[]} />
    );

    expect(screen.getByText("Rollout e eventos")).toBeInTheDocument();
    expect(screen.getByText("Pods gerados")).toBeInTheDocument();
    expect(screen.getAllByText("Escala e HPA")[0]).toBeInTheDocument();
    expect(screen.getByText("Exposicao: Service, Ingress e Endpoints")).toBeInTheDocument();
    expect(screen.getAllByText("Riscos e melhorias")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Limpeza e inconsistencias")[0]).toBeInTheDocument();

    expect(screen.getAllByText("Service: payments-api")[0]).toBeInTheDocument();
    expect(screen.getByText("HPA")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", {
        name: "Ingress: payments-api-public"
      })[0]
    ).toHaveAttribute("href", "/explorer/payments/Ingress/payments-api-public");
    expect(screen.getByText("Progressing: False")).toBeInTheDocument();
    expect(screen.getByText("Uso de CPU acima do target do HPA e rollout ainda instavel.")).toBeInTheDocument();
    expect(
      screen.getByText("ReplicaSet payments-worker-5ffcc7c9b8 continua sem pods ativos.")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: "Pod: payments-worker-6dffb4f7d7-4vw6p"
      })
    ).toHaveAttribute(
      "href",
      "/explorer/payments/Pod/payments-worker-6dffb4f7d7-4vw6p"
    );

    expect(
      screen.getByText("Worker de pagamentos sem requests/limits adequados")
    ).toBeInTheDocument();
    expect(
      screen.getByText("kubectl -n payments describe deploy payments-worker")
    ).toBeInTheDocument();
  });

  it("keeps non-deployment resources navigable even without rollout data", () => {
    render(
      <ResourceDetailScreen detail={sampleResourceDetails[1]} degradedSources={[]} />
    );

    expect(screen.getByText("Nenhuma configuracao de autoscaling apareceu para este recurso.")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma relacao de exposicao foi encontrada nesta coleta.")).toBeInTheDocument();
    expect(screen.getByText("Service de entrada com apenas parte dos backends prontos.")).toBeInTheDocument();
    expect(screen.getAllByText("Relacoes do recurso")[0]).toBeInTheDocument();
  });
});
