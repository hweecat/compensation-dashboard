export function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}

export function setHtml(id, html) {
  byId(id).innerHTML = html;
}

export function setText(id, value) {
  byId(id).textContent = value;
}

export function setActiveBySelector(selector, predicate) {
  document.querySelectorAll(selector).forEach((element) => {
    element.classList.toggle("is-active", predicate(element));
  });
}
