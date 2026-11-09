// E-mail não diferencia maiúsculas: sem normalizar, "Ana@x.com" e "ana@x.com" virariam contas diferentes.
function normalizarEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export { normalizarEmail };
