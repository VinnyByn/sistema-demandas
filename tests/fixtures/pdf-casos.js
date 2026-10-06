// Textos simulados no formato do PDF padrão (linhas \n, páginas \f) + resultado esperado.
const P = "\f";
const padrao = [
  ["ESTUDO DE VIABILIDADE TÉCNICA", "Projeto: Condomínio Reserva das Flores", "Data: 12/09/2026",
   "CAPEX ESTIMADO R$ 18.450,00", "Portas estimadas 120", "Estudo de área", "HP 320 HC 96"].join("\n"),
  ["1. Introdução", "Atendimento ao condomínio.", "2. Escopo do projeto", "Lançamento de rede FTTH.",
   "CUSTO ESTIMADO SOMA PARCIAL",
   'Material Classe "A" R$ 5.000,00 R$ 5.000,00',
   "Mão de obra Regional R$ 2.100,00 R$ 2.100,00",
   'Mão de obra Classe "L" R$ 3.000,00 R$ 3.000,00',
   'Mão de obra Classe "F" R$ 1.750,00 R$ 1.750,00',
   "INVESTIMENTO R$ 18.450,00", "3. Cronograma", "Prazo de execução 30 dias"].join("\n"),
  ["4. Custo", "4.1 Detalhamento de materiais", "Caixa de emenda 24 fibras un 3 R$ 150,00 R$ 450,00",
   "4.1.1 Custo de Lançamento", "LANÇAMENTO DE CABOS", "Nome do cabo Unidade Metragem do cabo Preço",
   "CFOA SM ASU 80 S 12 FIBRAS NR m 1.850 R$ 2,02 R$ 3.737,00",
   "CFOA SM ASU 80 S 36 FIBRAS NR m 340 R$ 3,10 R$ 1.054,00",
   "Total R$ 4.791,00", "5. Observações", "Sem observações."].join("\n"),
].join(P);

module.exports = [
  {
    nome: "PDF padrão completo",
    texto: padrao,
    esperado: { valorProjeto: 18450, qtdNovasPortas: 120, qtdCasas: 320, qtdPortasAtual: 96,
      execucao: "Regional + Terceirizada", custoRegional: 2100, custoTerceirizada: 4750,
      cabos: { "FO-12": 1850, "FO-36": 340 } },
  },
  {
    nome: "Sem portas / sem execução; rótulo de portas seguido de data",
    texto: [
      ["ESTUDO DE VIABILIDADE TÉCNICA", "CAPEX ESTIMADO R$ 7.200,00", "Portas estimadas", "Data: 12/09/2026",
       "Reajuste previsto de 5% 2027"].join("\n"),
      ["2. Escopo do projeto", "Ampliação de backbone.", "3. Cronograma", "Prazo 15 dias"].join("\n"),
      ["4. Custo", "4.1.1 Custo de Lançamento", "LANÇAMENTO DE CABOS", "Nome do cabo Unidade Metragem do cabo Preço",
       "CFOA SM ASU 80 S 06 FIBRAS NR m 900 R$ 1,80 R$ 1.620,00", "Total R$ 1.620,00"].join("\n"),
    ].join(P),
    esperado: { valorProjeto: 7200, cabos: { "FO-06": 900 } },
  },
  {
    nome: "Sem lançamento de cabos; materiais citam fibras",
    texto: [
      ["ESTUDO DE VIABILIDADE TÉCNICA", "CAPEX ESTIMADO R$ 3.100,00"].join("\n"),
      ["2. Escopo do projeto", "Troca de equipamentos.", "CUSTO ESTIMADO SOMA PARCIAL",
       "Mão de obra Regional R$ 800,00 R$ 800,00", "INVESTIMENTO R$ 3.100,00"].join("\n"),
      ["4. Custo", "4.1 Detalhamento de materiais", "Cordão óptico 12 fibras un 15 R$ 20,00 R$ 300,00",
       "Caixa de emenda 24 fibras", "2", "Total R$ 300,00"].join("\n"),
    ].join(P),
    esperado: { valorProjeto: 3100, execucao: "Regional", custoRegional: 800, cabos: {} },
  },
  {
    nome: "Estudo de área sem HC; HP em outra linha",
    texto: [
      ["ESTUDO DE VIABILIDADE TÉCNICA", "CAPEX ESTIMADO R$ 9.999,90", "Portas estimadas: 45", "Estudo de área", "HP", "210",
       "Responsável: João - Tel 31 99999-0000"].join("\n"),
    ].join(P),
    esperado: { valorProjeto: 9999.9, qtdNovasPortas: 45, qtdCasas: 210 },
  },
];
