# Atualização diária automática das cotações (ações, FIIs, ETFs)

## O que muda para você
- Todo dia à meia-noite (horário de Brasília), o app busca sozinho o preço de fechamento da bolsa de cada ativo com código (ex.: PETR4, MXRF11).
- O saldo de cada investimento passa a ser: **quantidade de cotas x preço de fechamento**.
- O card mostra a data/hora da última atualização. Funciona mesmo com o app fechado.
- A atualização ao abrir a página e o botão de atualizar manual continuam funcionando.

## Regras
- Só entram ativos dos tipos ações, FIIs, ETFs e cripto que tenham código e quantidade informados.
- Investimentos resgatados/encerrados ficam de fora.
- Se a bolsa não retornar o preço de um código, esse ativo fica como estava e os outros são atualizados normalmente.
- Em fins de semana e feriados fica o último fechamento (o valor não muda).

## Detalhes técnicos
- Novo endpoint `src/routes/api/public/hooks/update-quotes.ts` (POST), protegido pelo segredo `LOVABLE_CRON_SECRET`, que já existe (header `Authorization: Bearer`). Requisições sem o segredo correto recebem 401.
- O handler usa o cliente admin (carregado dentro do handler) para ler os investimentos ativos com `ticker` e `quantity > 0` e tipo cotado, agrupa os tickers sem repetir, consulta a brapi em lotes de até 20 (reaproveitando a lógica de `quotes.functions.ts`, que vai para um helper `quotes.server.ts`) e atualiza `last_quote`, `quote_updated_at` e `current_amount = quantity * last_quote`.
- Tarefa limitada: no máximo 200 tickers por execução, e falhas por ticker são registradas sem interromper o resto.
- Agendamento diário com pg_cron + pg_net às `0 3 * * *` UTC (00:00 em Brasília), chamando a URL estável publicada do projeto. Roda 1 vez por dia, custo mínimo.
- Observação: o agendamento chama o app publicado, então ele precisa ser publicado para a rotina funcionar.
- Validação: chamar o endpoint manualmente uma vez e conferir os saldos atualizados.
