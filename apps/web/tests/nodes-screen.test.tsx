import { render, screen } from "@testing-library/react";
import { NodesScreen } from "../components/screens/nodes-screen";
import { sampleAnalysisResponse } from "../lib/sample-data";

describe("NodesScreen", () => {
  it("shows node pressure and heavy workloads", () => {
    render(
      <NodesScreen
        nodes={sampleAnalysisResponse.snapshot.nodes}
        degradedSources={sampleAnalysisResponse.degradedSources}
      />
    );

    expect(screen.getByText("worker-03")).toBeInTheDocument();
    expect(screen.getByText("memory")).toBeInTheDocument();
    expect(screen.getByText("payments-worker")).toBeInTheDocument();
  });
});
