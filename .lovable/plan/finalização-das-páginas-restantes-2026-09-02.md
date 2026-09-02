# Finalização das páginas restantes

## Contexto
As páginas faltantes foram implementadas: Patrimônio, Orçamento, Metas, Relatórios e Configurações. Agora é necessário validar se tudo compila, se os tipos estão corretos e se as páginas renderizam corretamente no preview.

## Passos

1. **Typecheck e build**
   - Rodar `bunx tsc --noEmit` (ou o typecheck do projeto) para identificar erros de tipagem nas páginas recém-criadas.
   - Verificar `build-errors.log` em `/tmp/observability` após o build automático.

2. **Correções de tipo e lógica**
   - Ajustar quaisquer erros TS encontrados nos arquivos:
     - `src/routes/_authenticated/patrimonio.tsx`
     - `src/routes/_authenticated/orcamento.tsx`
     - `src/routes/_authenticated/metas.tsx`
     - `src/routes/_authenticated/relatorios.tsx`
     - `src/routes/_authenticated/configuracoes.tsx`
   - Verificar classes CSS inexistentes (ex: `text-success`) e substituir por tokens válidos.

3. **Verificação visual no preview**
   - Navegar pelas rotas `/patrimonio`, `/orcamento`, `/metas`, `/relatorios` e `/configuracoes`.
   - Confirmar que listas vazias, cards, gráficos e formulários aparecem corretamente.

4. **Validação de integridade**
   - Confirmar que as páginas leem as mesmas tabelas compartilhadas (`transactions`, `accounts`, `categories`, `family_members`, etc.).
   - Garantir que o filtro de escopo (Minhas finanças / Família) funcione em todas elas.

## Nota sobre créditos
Não é possível estimar um número exato de créditos de build: o consumo depende da complexidade das correções necessárias, do número de iterações e do escopo dos ajustes. O plan mode consome 1 crédito por mensagem; o build mode é cobrado por uso real. Seu workspace está no plano Free e já usou 5 créditos neste período.
