import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "../components/chat-panel";

describe("ChatPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits a question and renders the answer payload", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "Os pods de payments concentram os maiores reinicios do snapshot.",
        citations: [
          {
            type: "issue",
            label: "issue-oom-payments",
            issueId: "issue-oom-payments"
          }
        ],
        suggestedFollowUps: [
          "Quer ver os comandos recomendados para esse workload?"
        ],
        generatedAt: "2026-03-11T16:00:00.000Z"
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <ChatPanel suggestedQuestions={["Quais pods estao reiniciando mais agora?"]} />
    );

    await user.click(screen.getByRole("button", { name: "Consultar cluster" }));

    await waitFor(() => {
      expect(
        screen.getByText("Os pods de payments concentram os maiores reinicios do snapshot.")
      ).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("issue: issue-oom-payments")).toBeInTheDocument();
  });
});
