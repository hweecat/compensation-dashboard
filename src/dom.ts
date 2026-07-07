export function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}

export function setHtml(id: string, html: string): void {
  byId(id).innerHTML = html;
}

export function setText(id: string, value: string): void {
  byId(id).textContent = value;
}

export function setActiveBySelector(selector: string, predicate: (element: Element) => boolean): void {
  document.querySelectorAll(selector).forEach((element) => {
    element.classList.toggle("is-active", predicate(element));
  });
}