import { render, screen } from "@testing-library/react";
import { OverviewScreen } from "../components/screens/overview-screen";
import { sampleAnalysisResponse } from "../lib/sample-data";

describe("OverviewScreen", () => {
  it("renders the main cluster summary and highlighted issues", () => {
    render(
      <OverviewScreen
        overview={sampleAnalysisResponse.snapshot.overview}
        degradedSources={sampleAnalysisResponse.degradedSources}
      />
    );

    expect(screen.getByText("intesys-prod")).toBeInTheDocument();
    expect(
      screen.getByText("Worker de pagamentos sem requests/limits adequados")
    ).toBeInTheDocument();
    expect(screen.getByText("Algumas fontes estao degradadas")).toBeInTheDocument();
  });
});
