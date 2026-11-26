// Confirmações e avisos com a janela do próprio app (segue o tema e destaca
// a ação), no lugar de window.confirm/window.alert. O <ConfirmHost /> do
// layout raiz mostra o pedido da vez; sem ele (testes, SSR), cai na janela
// nativa para não perder a confirmação.

export type ConfirmRequest = {
  message: string;
  kind: 'confirm' | 'alert';
  resolve: (ok: boolean) => void;
};

type Listener = (request: ConfirmRequest) => void;
let listener: Listener | null = null;

export function setConfirmListener(next: Listener | null) {
  listener = next;
}

export function confirmAction(message: string): Promise<boolean> {
  if (!listener) return Promise.resolve(window.confirm(message));
  const show = listener;
  return new Promise((resolve) => show({ message, kind: 'confirm', resolve }));
}

export function notify(message: string): Promise<void> {
  if (!listener) {
    window.alert(message);
    return Promise.resolve();
  }
  const show = listener;
  return new Promise((resolve) =>
    show({ message, kind: 'alert', resolve: () => resolve() }),
  );
}
