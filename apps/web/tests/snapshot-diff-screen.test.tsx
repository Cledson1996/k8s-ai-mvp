import { render, screen } from "@testing-library/react";
import { SnapshotDiffScreen } from "../components/screens/snapshot-diff-screen";
import { sampleSnapshotDiffs } from "../lib/sample-data";

describe("SnapshotDiffScreen", () => {
  it("renders snapshot comparison summary and links back to changed resources", () => {
    render(
      <SnapshotDiffScreen diff={sampleSnapshotDiffs[0]} degradedSources={[]} />
    );

    expect(screen.getByText("Mudancas observadas")).toBeInTheDocument();
    expect(screen.getByText("payments-worker")).toBeInTheDocument();
    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Abrir recurso" })[0]
    ).toHaveAttribute("href", "/explorer/payments/Deployment/payments-worker");
  });
});
