import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlantMemoryEpisodesSection } from "@/components/PlantMemoryEpisodesSection";
import GrowLearning from "@/pages/GrowLearning";
const io = vi.hoisted(() => ({
  state: { status: "unavailable" } as Record<string, unknown>,
  reload: vi.fn(),
}));
vi.mock("@/hooks/usePlantMemoryEpisodes", () => ({
  usePlantMemoryEpisodes: () => ({ state: io.state, reload: io.reload }),
}));
vi.mock("@/components/PlantMemoryEpisodeCard", () => ({
  PlantMemoryEpisodeCard: () => <p>Episode evidence</p>,
}));
vi.mock("@/components/PageHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/GrowLearningSummary", () => ({
  GrowLearningSummary: () => <p>Learning summary</p>,
}));
vi.mock("@/components/GrowLearningEpisodeList", () => ({
  GrowLearningEpisodeList: () => <p>Learning list</p>,
}));
vi.mock("@/components/NextRunPlaybook", () => ({ NextRunPlaybook: () => <p>Playbook</p> }));
vi.mock("@/lib/react-router-compat", () => ({
  useParams: () => ({ growId: "grow-a" }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
beforeEach(() => {
  io.state = { status: "unavailable" };
  io.reload.mockReset();
});
afterEach(cleanup);
it("shows unavailable and an explicit retry on the plant", () => {
  render(<PlantMemoryEpisodesSection growId="grow-a" plantId="plant-a" />);
  expect(screen.getByRole("status")).toHaveTextContent(/learning episodes are unavailable/i);
  fireEvent.click(screen.getByRole("button", { name: "Retry learning episodes" }));
  expect(io.reload).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Episode evidence")).not.toBeInTheDocument();
});
it("shows loading while the plant read is unresolved", () => {
  io.state = { status: "loading" };
  render(<PlantMemoryEpisodesSection growId="grow-a" plantId="plant-a" />);
  expect(screen.getByRole("status")).toHaveTextContent(/loading learning episodes/i);
  expect(screen.queryByText("Episode evidence")).not.toBeInTheDocument();
});
it("retains the quiet successful-empty plant section", () => {
  io.state = { status: "ok", episodes: [] };
  const { container } = render(<PlantMemoryEpisodesSection growId="grow-a" plantId="plant-a" />);
  expect(container).toBeEmptyDOMElement();
});
it("renders successfully read plant episodes", () => {
  io.state = { status: "ok", episodes: [{ episodeKey: "one" }] };
  render(<PlantMemoryEpisodesSection growId="grow-a" plantId="plant-a" />);
  expect(screen.getByText("Episode evidence")).toBeInTheDocument();
});
it("offers retry on the grow learning unavailable state without empty claims", () => {
  render(<GrowLearning />);
  expect(screen.getByTestId("grow-learning-unavailable")).toHaveTextContent(/unavailable/i);
  fireEvent.click(screen.getByRole("button", { name: "Retry learning review" }));
  expect(io.reload).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId("grow-learning-empty")).not.toBeInTheDocument();
});
it("keeps successful-empty grow learning copy", () => {
  io.state = { status: "ok", episodes: [] };
  render(<GrowLearning />);
  expect(screen.getByTestId("grow-learning-empty")).toHaveTextContent("No completed actions yet");
});
