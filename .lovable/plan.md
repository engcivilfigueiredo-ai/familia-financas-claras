# Plano: aporte em previdência privada

## Contexto
Hoje o app já cadastra investimentos do tipo "previdência", mas trata-os como renda fixa genérica. O aporte é feito manualmente pelo botão "Movimentar investimento" → "aplicação", com conta de origem opcional. Não há campos para PGBL/VGBL, regime tributário, IR na fonte ou beneficiário, e não é possível transformar o aporte em uma contribuição mensal automática.

## Objetivo
Permitir que o usuário cadastre uma previdência privada com dados específicos do plano, lance aportes pontuais de forma clara e, se desejar, converta o aporte em uma recorrência automática que gera a aplicação no investimento e a saída da conta corrente.

## Decisões já tomadas
- Sim, distinguir PGBL/VGBL e regime tributário (progressivo/regressivo).
- Aporte recorrente (contribuição mensal automática).
- Conta de origem do aporte é opcional.

## Passos

### 1. Campos específicos de previdência no cadastro de investimento
Adicionar na tabela `investments`:
- `plan_type` — PGBL ou VGBL.
- `tax_regime` — progressivo ou regressivo.
- `withhold_ir` — indica se há retenção de IR na fonte.
- `beneficiary` — nome do beneficiário (opcional).

Atualizar a interface `InvestmentRow` e o formulário da página `investimentos.tsx`: quando o tipo for "previdência", exibir esses campos extras em vez de ticker/quantidade/preço médio/cotação.

### 2. Vínculo entre recorrência e investimento
Adicionar na tabela `recurring_transactions`:
- `investment_id` (referência ao investimento, opcional).
- `is_investment_contribution` (boolean, indica que a recorrência é um aporte de previdência).

Isso permite que uma recorrência seja dedicada a um investimento, sem confundir com despesas/receitas comuns.

### 3. Materializar aporte de previdência
Adaptar `materializeRecurring` em `src/lib/transactions.ts`: quando `is_investment_contribution` for true, em vez de inserir uma transação comum, chamar a lógica de `createInvestmentMove` com tipo "aplicação", usando:
- o `investment_id` como destino;
- o `account_id` como conta de origem (quando informado), gerando a transferência de saída;
- a pessoa e a data da ocorrência.

Isso mantém o saldo do investimento, do fluxo de caixa e da conta bancária sincronizados automaticamente.

### 4. Fluxo na página de investimentos
Adicionar à página `investimentos.tsx`, para investimentos do tipo "previdência", um botão ou opção "Aporte recorrente". Ao ativar:
- abrir diálogo com valor, data de início, frequência (mensal por padrão), fim opcional e conta de origem opcional;
- criar a `recurring_transactions` vinculada ao investimento com `is_investment_contribution = true`;
- gerar as ocorrências futuras imediatamente (como já acontece com outras recorrências).

### 5. Ajustes na página de recorrências
Em `recorrencias.tsx`:
- identificar visualmente as recorrências que são aportes de previdência (ícone/etiqueta);
- garantir que os botões "Gerar" e "Atualizar" usem a nova lógica de materialização quando `is_investment_contribution` for true.

### 6. Informações de IR regressivo (opcional, visual)
Na página de investimentos, quando `tax_regime` for "regressivo", exibir uma legenda com a tabela regressiva padrão da previdência (até 2 anos 35%, 2–4 anos 30%, 4–6 anos 25%, 6–8 anos 20%, acima de 8 anos 15%). Não altera cálculos de resgate nesta entrega, apenas serve de referência para o usuário.

### 7. Validação
- Typecheck e build limpos.
- Verificar se a migration inclui GRANTs para as colunas/tabelas alteradas (as tabelas já existem; a migration fará `ALTER TABLE` e, se necessário, ajustará políticas).
