// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { ChatPanel } from "./ChatPanel";
import type { SocketManager } from "../../network/socket";

describe("ChatPanel autocomplete", () => {
  afterEach(() => {
    cleanup();
  });

  const fakeSocket = {
    send: vi.fn(),
  } as unknown as SocketManager;

  const mockPresence = [
    { id: "1", nickname: "Mestre Supremo", role: "gm" as const, online: true },
    { id: "2", nickname: "Jogador 1", role: "player" as const, online: true },
    { id: "3", nickname: "Jogador Offline", role: "player" as const, online: false },
    { id: "4", nickname: "Meu Nick", role: "player" as const, online: true },
  ];

  it("exibe comandos ao digitar / e oculta comandos de GM para jogadores normais", () => {
    render(
      <ChatPanel
        socket={fakeSocket}
        presence={mockPresence}
        currentNickname="Meu Nick"
        currentRole="player"
      />,
    );

    const input = screen.getByPlaceholderText("Digite mensagem ou / para Comandos");
    fireEvent.change(input, { target: { value: "/" } });

    const listbox = screen.getByRole("listbox");
    // Comandos públicos devem aparecer
    expect(within(listbox).getByText("/roll")).toBeTruthy();
    expect(within(listbox).getByText("/adv")).toBeTruthy();
    expect(within(listbox).getByText("/dis")).toBeTruthy();
    expect(within(listbox).getByText("/whisper")).toBeTruthy();
    expect(within(listbox).getByText("/w")).toBeTruthy();

    // Comandos de GM NÃO devem aparecer para player
    expect(within(listbox).queryByText("/secret")).toBeNull();
    expect(within(listbox).queryByText("/setdice")).toBeNull();
  });

  it("exibe comandos de GM quando currentRole é gm", () => {
    render(
      <ChatPanel
        socket={fakeSocket}
        presence={mockPresence}
        currentNickname="Mestre Supremo"
        currentRole="gm"
      />,
    );

    const input = screen.getByPlaceholderText("Digite mensagem ou / para Comandos");
    fireEvent.change(input, { target: { value: "/" } });

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("/secret")).toBeTruthy();
    expect(within(listbox).getByText("/setdice")).toBeTruthy();
  });

  it("sugere jogadores e mestres no whisper excluindo a si mesmo", () => {
    render(
      <ChatPanel
        socket={fakeSocket}
        presence={mockPresence}
        currentNickname="Meu Nick"
        currentRole="player"
      />,
    );

    const input = screen.getByPlaceholderText("Digite mensagem ou / para Comandos");
    fireEvent.change(input, { target: { value: "/w " } });

    const listbox = screen.getByRole("listbox");
    // Deve sugerir os outros membros dentro do listbox
    expect(within(listbox).getByText("Mestre Supremo")).toBeTruthy();
    expect(within(listbox).getByText("Jogador 1")).toBeTruthy();
    expect(within(listbox).getByText("Jogador Offline")).toBeTruthy();

    // NÃO deve sugerir o próprio usuário
    expect(within(listbox).queryByText("Meu Nick")).toBeNull();
  });

  it("preenche o comando ao pressionar Tab ou clicar na sugestão", () => {
    render(
      <ChatPanel
        socket={fakeSocket}
        presence={mockPresence}
        currentNickname="Meu Nick"
        currentRole="player"
      />,
    );

    const input = screen.getByPlaceholderText("Digite mensagem ou / para Comandos") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "/w" } });

    // Seleciona /w pressionando Tab (exato match vem em primeiro)
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.value).toBe("/w ");

    // Agora está no modo whisper, clica em "Jogador 1" no listbox
    const listbox = screen.getByRole("listbox");
    const targetOption = within(listbox).getByText("Jogador 1");
    fireEvent.mouseDown(targetOption);

    // Deve preencher com o jogador e espaço
    expect(input.value).toBe("/w Jogador 1 ");

    // O popup fecha após escolher o jogador
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("fecha o autocomplete com Escape", () => {
    render(
      <ChatPanel
        socket={fakeSocket}
        presence={mockPresence}
        currentNickname="Meu Nick"
        currentRole="player"
      />,
    );

    const input = screen.getByPlaceholderText("Digite mensagem ou / para Comandos");
    fireEvent.change(input, { target: { value: "/" } });
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
