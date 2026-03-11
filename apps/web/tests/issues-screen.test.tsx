import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IssuesScreen } from "../components/screens/issues-screen";
import { sampleAnalysisResponse } from "../lib/sample-data";

describe("IssuesScreen", () => {
  it("filters issues and expands the playbook", async () => {
    const user = userEvent.setup();

    render(
      <IssuesScreen
        issues={sampleAnalysisResponse.snapshot.issues}
        degradedSources={[]}
      />
    );

    await user.selectOptions(
      screen.getByLabelText("Filtrar por origem"),
      "prometheus"
    );

    expect(
      screen.queryByText("Worker de pagamentos sem requests/limits adequados")
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Node worker-03 com pressao de memoria")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver playbook" }));

    expect(screen.getByText("Comandos sugeridos")).toBeInTheDocument();
    expect(screen.getByText("kubectl describe node worker-03")).toBeInTheDocument();
  });
});
