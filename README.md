# Family Ledger

Crie um aplicativo web de controle financeiro pessoal e familiar chamado "Controle Financeiro Família", para uso privado (não é um SaaS multiempresa — é um app para uma única família administrar suas finanças).

OBJETIVO

O usuário principal cadastra membros da sua família e passa a registrar receitas, despesas, transferências, cartões de crédito, investimentos, ativos e passivos, tendo uma visão individual ("Minhas finanças") e uma visão consolidada ("Finanças da família"), sempre respondendo: quanto tenho, quanto minha família tem, quanto gastamos, quanto investimos, qual nosso patrimônio e quais contas vencem em breve.

PÚBLICO

Uso pessoal/familiar, não corporativo. Prioridade máxima: clareza, confiabilidade dos números e rapidez para registrar um lançamento.

STACK TÉCNICA

React + TypeScript + Tailwind CSS. Backend com Supabase (Postgres + Auth + Row Level Security). Gráficos com uma lib moderna (ex: recharts). Formatação monetária em Real brasileiro (R$, separador de milhar com ponto e decimal com vírgula) e datas no formato DD/MM/AAAA.

AUTENTICAÇÃO E SEGURANÇA

- Login/cadastro com e-mail e senha via Supabase Auth, com recuperação de senha.

- Cada usuário autenticado é o "dono" da conta familiar.

- Row Level Security em todas as tabelas: um usuário nunca acessa dados de outro usuário.

- Arquitetura preparada (mas não implementada na v1) para futuramente convidar outro usuário a compartilhar o mesmo espaço familiar com permissões.

BANCO DE DADOS (estrutura mínima obrigatória)

- users (gerenciado pelo Supabase Auth)

- family_members: id, user_id, name, avatar_url, color, is_active, relationship

- accounts: id, user_id, family_member_id, name, institution, type (corrente/poupança/carteira/digital/investimento/outros), initial_balance, current_balance, currency, color, icon, is_active

- credit_cards: id, user_id, family_member_id, name, institution, brand, credit_limit, closing_day, due_day, color, is_active

- categories: id, user_id, name, type (receita/despesa), icon, color, parent_id (nullable, para subcategorias), sort_order

- transactions: id, user_id, family_member_id, type (receita/despesa/transferencia), description, amount, date, category_id, account_id, credit_card_id (nullable), payment_method, status (pago/pendente/atrasado), is_recurring, recurring_id (nullable), installment_id (nullable), installment_number (nullable), transfer_group_id (nullable, liga as duas pernas de uma transferência), tags (array), notes, created_at, updated_at

- recurring_transactions: id, user_id, family_member_id, description, amount, type, frequency, start_date, end_date (nullable), category_id, account_id, credit_card_id, is_active

- installments: id, user_id, family_member_id, purchase_description, total_amount, installment_count, credit_card_id, category_id, purchase_date

- invoices: id, credit_card_id, reference_month, closing_date, due_date, total_amount, status (aberta/fechada/paga)

- investments: id, user_id, family_member_id, name, institution, type (renda fixa/CDB/Tesouro Direto/LCI-LCA/fundos/ações/ETFs/FIIs/cripto/previdência/outros), application_date, invested_amount, current_amount, quantity, average_price, maturity_date (nullable), liquidity, status

- investment_transactions: id, investment_id, type (aplicação/resgate/rendimento/dividendo/jcp), amount, date, ir_type (isento/15%/tabela regressiva)

- assets: id, user_id, family_member_id, name, type, value, acquisition_date

- liabilities: id, user_id, family_member_id, name, type, total_amount, remaining_amount, monthly_payment, due_day

- budgets: id, user_id, family_member_id (nullable = orçamento familiar), category_id, month_reference, limit_amount

- financial_goals: id, user_id, family_member_id, name, target_amount, current_amount, target_date, category, monthly_contribution_needed

- notifications: id, user_id, type, message, related_entity_type, related_entity_id, is_read, due_date

- attachments: id, transaction_id, file_url, file_type

REGRAS DE NEGÓCIO OBRIGATÓRIAS

1. Transferências entre contas nunca contam como receita/despesa em relatórios; apenas debitam a conta origem e creditam a conta destino, mantendo o patrimônio líquido inalterado. Implemente como duas transações do tipo "transferencia" ligadas por transfer_group_id.

2. Compras no cartão são despesas vinculadas à fatura do mês de fechamento correspondente à data da compra e ao dia de fechamento do cartão.

3. Ao cadastrar uma compra parcelada, gere automaticamente todas as parcelas futuras como transações individuais, cada uma associada à fatura do mês correspondente, todas ligadas ao mesmo installments.id.

4. O pagamento de uma fatura é tratado como transferência (conta → cartão), nunca como uma nova despesa, pois a despesa já foi contabilizada na compra.

5. Aporte em investimento = transferência de conta para investimento (não é despesa). Resgate = transferência de investimento para conta (não é receita, exceto o ganho/rendimento embutido, que deve ser tratado separadamente via investment_transactions).

6. Rendimentos, dividendos e JCP de investimentos são lançados via investment_transactions e considerados receita no fluxo de caixa, com tratamento fiscal diferenciado (Dividendo = isento; JCP = com retenção de IR; Rendimento de renda fixa = conforme tabela regressiva).

7. Patrimônio líquido = soma de saldos de contas + valor atual de investimentos + valor de assets, menos o total de liabilities e faturas em aberto.

8. A visão "Família" soma os dados de todos os family_members sem duplicar nenhum registro — é sempre uma agregação (SUM/GROUP BY), nunca uma cópia de dados.

9. Toda exclusão de lançamento, conta, cartão ou investimento deve pedir confirmação explícita antes de executar.

10. Toda tela que dependa de dados deve ter estado de carregamento, estado vazio (com call-to-action) e tratamento de erro.

FUNCIONALIDADES E TELAS

1. Dashboard: saldo total, saldo disponível, receitas do mês, despesas do mês, resultado do mês, total investido, patrimônio líquido, contas a pagar/receber, fatura atual dos cartões, próximos vencimentos, evolução patrimonial. Gráficos de receitas x despesas, gastos por categoria, evolução do patrimônio, evolução dos investimentos, fluxo de caixa, gastos por membro, por conta e por cartão. Seletor de período (este mês, mês anterior, últimos 3/6 meses, este ano, personalizado). Toggle "Minhas finanças" / "Família".

2. Lançamentos: CRUD completo com formulário dinâmico conforme o tipo escolhido (receita/despesa/transferência/investimento), filtros por período, pessoa, categoria, conta, cartão, tipo, status e valor, busca, edição, exclusão com confirmação e duplicação de lançamentos.

3. Categorias: CRUD de categorias e subcategorias, com categorias padrão pré-cadastradas (despesas: Alimentação, Moradia, Transporte, Saúde, Educação, Lazer, Compras, Assinaturas, Impostos, Seguros, Viagens, Pets, Outros; receitas: Salário, Freelance, Negócios, Rendimentos, Dividendos, Aluguéis, Outros), reordenáveis.

4. Contas: CRUD de contas com tipo, saldo inicial/atual, instituição, cor/ícone, pessoa responsável.

5. Cartões de crédito: CRUD de cartões, cadastro de compras (à vista e parceladas com geração automática das parcelas), visualização de fatura atual, faturas futuras e faturas fechadas/pagas, limite utilizado/disponível calculado automaticamente.

6. Contas a pagar e a receber: lista com vencimento, valor, categoria, pessoa, status e alertas visuais (vencendo hoje, vencendo em breve, atrasada).

7. Recorrências: cadastro de lançamentos recorrentes (frequência, data inicial/final, valor fixo ou variável) que geram automaticamente as transações futuras.

8. Investimentos: CRUD manual (sem integração com corretoras na v1, mas com arquitetura pronta para isso no futuro), dashboard próprio com total investido, valor atual, lucro/prejuízo, rentabilidade, distribuição por classe e por instituição, evolução do patrimônio investido.

9. Patrimônio: visão de ativos - passivos = patrimônio líquido, com gráfico de evolução.

10. Orçamento: definição de limite mensal por categoria, comparando orçado x gasto x restante x percentual utilizado, com indicador visual de alerta perto/acima do limite.

11. Metas financeiras: CRUD com nome, valor objetivo, valor atual, data objetivo, pessoa, categoria, progresso (barra visual) e cálculo automático do valor mensal necessário.

12. Relatórios: receitas, despesas, fluxo de caixa, gastos por categoria/pessoa/cartão/conta, investimentos, patrimônio, dívidas, orçamento — com filtros avançados e exportação para CSV, Excel e PDF.

13. Busca global: pesquisa por texto que encontra lançamentos, contas, cartões, investimentos e pessoas relacionadas.

14. Notificações: contas vencendo/atrasadas, faturas próximas do vencimento, orçamento perto do limite, metas, investimentos com vencimento.

15. Família: cadastro de membros com nome, foto/avatar, cor, status, e vínculo automático das contas/cartões/investimentos/lançamentos cadastrados para cada um.

16. Configurações: edição de perfil, categorias, preferências de moeda/formato, gerenciamento de membros da família.

UX

Botão destacado "+ Novo lançamento" sempre visível, que abre um formulário com escolha rápida entre Receita, Despesa, Transferência e Investimento, mudando os campos dinamicamente. Atalhos diretos para nova despesa, nova receita, nova transferência, nova aplicação, novo cartão e nova conta. Menu lateral com: Dashboard, Lançamentos, Contas, Cartões, Contas a pagar, Contas a receber, Investimentos, Patrimônio, Orçamento, Metas, Relatórios, Categorias, Família, Configurações.

DESIGN

Visual moderno, elegante, minimalista, profissional, no padrão de apps financeiros atuais. Mobile first, totalmente responsivo, também excelente em desktop. Uso de cards, gráficos, ícones, badges, indicadores coloridos, tabelas e filtros claros. Evitar poluição visual — o usuário precisa entender sua situação financeira em segundos.

DADOS INICIAIS

Ao criar a conta, popular automaticamente as categorias padrão listadas acima e criar um family_member inicial com o nome do usuário.

CRITÉRIOS DE ACEITE DA V1

- Login, cadastro e recuperação de senha funcionando com Supabase Auth e RLS ativo em todas as tabelas.

- CRUD completo e funcional (não mockado) de: membros da família, contas, cartões, categorias, lançamentos, contas a pagar/receber, recorrências, investimentos, ativos, passivos, orçamentos e metas.

- Transferências, compras parceladas, faturas de cartão e aportes/resgates de investimento seguindo exatamente as regras de negócio descritas acima, sem duplicar valores em receita/despesa.

- Dashboard e relatórios alimentados por dados reais do banco, não por dados fictícios fixos.

- Alternância funcional entre visão "Minhas finanças" e "Família".

- Responsividade completa, estados de loading, vazio e erro em todas as telas, confirmação em todas as exclusões, formatação monetária brasileira (R$) e datas em DD/MM/AAAA.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5946808a-572b-4a76-88d5-2d3ff80ea719).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
