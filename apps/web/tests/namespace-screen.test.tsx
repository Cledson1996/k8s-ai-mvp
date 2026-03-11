import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NamespaceScreen } from "../components/screens/namespace-screen";
import { sampleNamespaces, sampleSnapshots } from "../lib/sample-data";

describe("NamespaceScreen", () => {
  it("filters resources by kind and links to the resource detail page", async () => {
    const user = userEvent.setup();

    render(
      <NamespaceScreen
        namespace={sampleNamespaces[0]}
        snapshots={sampleSnapshots}
        degradedSources={[]}
      />
    );

    await user.selectOptions(
      screen.getByLabelText("Filtrar recursos por kind"),
      "Job"
    );

    expect(screen.getByText("billing-sync")).toBeInTheDocument();
    expect(screen.queryByText("payments-worker")).not.toBeInTheDocument();

    const detailLink = screen.getByRole("link", { name: "Ver recurso" });
    expect(detailLink).toHaveAttribute("href", "/explorer/payments/Job/billing-sync");
  });
});
