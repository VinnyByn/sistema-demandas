// Leitor do PDF de levantamento de custo: só preenche o que o PDF traz, com os valores certos.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

require(path.join(__dirname, "../../demandas-projetos/pdf-custo-import.js"));
const { parseCustoText } = globalThis.DemandasPdfCusto;
const casos = require("../fixtures/pdf-casos.js");

const CAMPOS = ["valorProjeto", "qtdNovasPortas", "qtdCasas", "qtdPortasAtual", "execucao", "custoRegional", "custoTerceirizada"];
const vazio = (v) => v === undefined || v === null || v === "";

for (const caso of casos) {
  test(`PDF de custo · ${caso.nome}`, () => {
    const r = parseCustoText(caso.texto);
    const v = r.values || {};
    for (const campo of CAMPOS) {
      const esperado = caso.esperado[campo];
      if (esperado === undefined) {
        assert.ok(vazio(v[campo]), `${campo} foi inventado: ${v[campo]}`);
      } else {
        assert.equal(String(v[campo]), String(esperado), `${campo}`);
      }
    }
    // Campos calculados (5%, valor final…) nunca vêm do texto.
    for (const k of Object.keys(v)) {
      if (k === "totalMetragem" || CAMPOS.includes(k)) continue;
      assert.ok(vazio(v[k]), `campo calculado lido do texto: ${k} = ${v[k]}`);
    }
    const cabos = Object.fromEntries((r.cabos || []).map((c) => [c.tipo, Number(c.metragem)]));
    assert.deepEqual(cabos, caso.esperado.cabos || {});
  });
}

test("PDF de custo · separador de milhar não vira decimal", () => {
  const r = parseCustoText(["ESTUDO DE VIABILIDADE TÉCNICA", "CAPEX ESTIMADO R$ 1.250.300,45"].join("\n"));
  assert.equal(r.values.valorProjeto, 1250300.45);
});
