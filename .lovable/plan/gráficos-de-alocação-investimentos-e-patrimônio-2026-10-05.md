# Gráficos de alocação — Investimentos e Patrimônio

## Objetivo
Mostrar visualmente como o dinheiro está distribuído: um gráfico de alocação por tipo de investimento (ações, FIIs, renda fixa, previdência etc.) na página de Investimentos, e um gráfico de composição do patrimônio (contas, investimentos, bens, menos dívidas/cartões) na página de Patrimônio.

## O que será feito

1. **Página Investimentos — gráfico "Alocação por tipo"**
   - Gráfico de rosca (donut) somando o valor atual de cada investimento agrupado por tipo (ações, FIIs, ETFs, renda fixa, previdência, cripto etc.).
   - Cada fatia com cor distinta, legenda com nome do tipo, valor em R$ e percentual do total.
   - Respeita o filtro de pessoa (escopo família/membro) já existente na página.
   - Se não houver investimentos, mostra estado vazio amigável.

2. **Página Patrimônio — gráfico "Composição do patrimônio"**
   - Gráfico de rosca com as parcelas positivas: Contas, Investimentos e Bens.
   - Dívidas e cartões aparecem em um bloco separado (barras ou lista) para não distorcer o gráfico com valores negativos, junto do patrimônio líquido.
   - Reutiliza os totais já calculados na página (summary).

3. **Implementação técnica**
   - Usar `recharts` (já usado no dashboard e relatórios) com `PieChart`/`Pie`/`Cell` e tooltip formatado em BRL.
   - Paleta de cores derivada dos tokens do tema (sem cores fixas hardcoded fora da paleta definida).
   - Componente compartilhado simples em `src/components/shared/` se houver reaproveitamento entre as duas páginas.

4. **Verificação**
   - Typecheck (`bunx tsgo --noEmit`) e build.
   - Teste no navegador: abrir Investimentos e Patrimônio e confirmar que os gráficos renderizam com os dados reais.

## Fora de escopo
- Evolução histórica do patrimônio ao longo do tempo (seria outro gráfico, pode ser um próximo passo).
