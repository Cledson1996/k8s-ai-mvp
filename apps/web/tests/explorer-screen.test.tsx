import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExplorerScreen } from "../components/screens/explorer-screen";
import { sampleNamespaces, sampleSnapshots } from "../lib/sample-data";

describe("ExplorerScreen", () => {
  it("filters namespaces and exposes navigation to the namespace detail", async () => {
    const user = userEvent.setup();

    render(
      <ExplorerScreen
        namespaces={sampleNamespaces}
        snapshots={sampleSnapshots}
        degradedSources={[]}
      />
    );

    await user.type(screen.getByLabelText("Buscar namespace"), "payments");

    expect(screen.getByText("payments")).toBeInTheDocument();
    expect(screen.queryByText("observability")).not.toBeInTheDocument();

    const namespaceLink = screen.getByRole("link", { name: "Abrir namespace" });
    expect(namespaceLink).toHaveAttribute("href", "/explorer/payments");
  });
});
