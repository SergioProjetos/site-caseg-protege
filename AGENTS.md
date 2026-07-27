# AGENTS.md — Projeto CASEG Protege

Este arquivo estabelece as regras obrigatórias para qualquer agente, assistente ou ferramenta automatizada que trabalhe neste projeto.

As instruções abaixo aplicam-se a todo o repositório e devem ser obedecidas antes de qualquer análise, desenvolvimento, correção ou operação com Git.

## 1. Princípio geral

Trabalhar de forma conservadora, previsível e incremental.

A prioridade é preservar tudo o que já está funcionando. Nenhuma melhoria, refatoração ou alteração adicional deve ser realizada sem solicitação e autorização explícitas do responsável pelo projeto.

## 2. Trabalho em micro passos

Todo trabalho deve ser dividido em micro passos.

Executar somente uma etapa por vez. Antes de avançar para a etapa seguinte, apresentar o resultado da etapa atual e aguardar a validação do responsável pelo projeto.

Não agrupar alterações independentes em uma única etapa.

Não antecipar tarefas que ainda não tenham sido autorizadas.

## 3. Verificações de leitura permitidas

Comandos e operações estritamente de leitura podem ser executados sem autorização adicional quando forem necessários para analisar o projeto ou preparar um micro passo.

São permitidos, entre outros:

- `git status`;
- `git diff`;
- `git log`;
- `git branch --show-current`;
- `git remote -v`;
- outros comandos Git comprovadamente somente de leitura;
- listagem de arquivos e diretórios;
- leitura de arquivos do projeto;
- pesquisa de arquivos, nomes, referências e conteúdos;
- inspeção de configurações que não contenham credenciais;
- execução de verificações que não alterem arquivos, Git, dependências, banco de dados ou serviços externos.

Essas permissões não incluem o arquivo `.env`, que permanece estritamente protegido.

Comandos aparentemente informativos que possam atualizar referências, gerar arquivos, alterar caches, acessar credenciais ou produzir qualquer mudança de estado não devem ser considerados somente de leitura.

Quando houver dúvida sobre o efeito de um comando, interromper e solicitar autorização antes de executá-lo.

## 4. Procedimento obrigatório antes de qualquer alteração

Antes de editar, criar, excluir, mover, renomear ou formatar qualquer arquivo, o agente deve:

1. verificar o estado atual do Git usando somente comandos de leitura;
2. explicar claramente o objetivo do micro passo;
3. informar exatamente quais arquivos serão afetados;
4. descrever o que será alterado em cada arquivo;
5. indicar os riscos da alteração;
6. explicar como a alteração poderá ser testada;
7. informar quais comandos, testes ou verificações pretende executar;
8. aguardar autorização explícita antes de realizar a alteração.

A autorização para analisar ou planejar uma tarefa não representa autorização para modificar arquivos.

A autorização para um micro passo não se estende automaticamente aos passos seguintes.

## 5. Procedimento obrigatório depois de cada alteração

Depois de cada alteração autorizada, o agente deve:

1. interromper o desenvolvimento;
2. mostrar exatamente o que foi alterado;
3. identificar todos os arquivos afetados;
4. explicar o impacto esperado;
5. informar qualquer risco, limitação ou efeito colateral identificado;
6. executar somente os testes previamente autorizados;
7. apresentar os resultados dos testes de forma clara;
8. verificar e informar o estado do Git usando somente comandos de leitura;
9. aguardar a validação do responsável antes de continuar.

Não iniciar outra alteração enquanto a etapa anterior não tiver sido validada.

## 6. Preservação do projeto

É proibido modificar funcionalidades, layouts, estilos, conteúdos ou fluxos já aprovados sem solicitação explícita.

Não realizar:

- refatorações amplas;
- reorganizações estruturais desnecessárias;
- alterações preventivas não solicitadas;
- mudanças cosméticas fora do escopo;
- renomeações não essenciais;
- formatação global de arquivos;
- substituição de tecnologias;
- mudanças em configurações não relacionadas à tarefa;
- correções adicionais encontradas durante outra tarefa sem autorização.

Se for identificado um problema fora do escopo, apenas relatá-lo e aguardar orientação.

## 7. Áreas protegidas

A Home e a Área do Cliente possuem layouts finalizados e aprovados.

Essas áreas não podem ser alteradas sem solicitação explícita e específica do responsável pelo projeto.

A proteção abrange, entre outros:

- HTML;
- CSS;
- JavaScript;
- componentes;
- textos;
- imagens e outros recursos visuais;
- responsividade;
- navegação;
- interações;
- fluxos;
- integrações;
- comportamento funcional.

Uma alteração em arquivo compartilhado que possa afetar a Home ou a Área do Cliente também deve ser considerada uma alteração dessas áreas.

Antes de modificar estilos, scripts, componentes ou configurações globais, o agente deve verificar se existe risco de impacto sobre as áreas protegidas. Havendo dúvida, deve interromper o trabalho e solicitar autorização.

## 8. Impacto de arquivos compartilhados

Toda alteração em arquivo compartilhado deve considerar e avaliar seu impacto sobre:

- a área administrativa;
- a Área do Cliente;
- a Home;
- as demais páginas públicas;
- componentes, estilos, scripts e integrações reutilizados.

Antes de modificar um arquivo compartilhado, o agente deve identificar quais áreas o utilizam e informar os possíveis impactos.

A autorização para alterar uma área específica não autoriza automaticamente mudanças colaterais nas demais áreas.

Se não for possível garantir que a alteração permanecerá restrita ao escopo solicitado, o agente deve interromper o trabalho e solicitar orientação.

## 9. Separação de responsabilidades

JavaScript deve cuidar da lógica, do comportamento e da estrutura funcional da aplicação.

A apresentação visual deve permanecer nos arquivos HTML e CSS apropriados.

Não inserir regras visuais desnecessárias em JavaScript.

Não transferir estilos entre HTML, CSS e JavaScript sem autorização explícita.

Não reorganizar a separação atual de responsabilidades apenas por preferência técnica.

## 10. Entrega de código completo

Quando o responsável solicitar código completo, o agente deve entregar o conteúdo integral do arquivo, e não apenas trechos, exemplos, diferenças ou partes omitidas.

O código completo deve:

- preservar todas as partes existentes que não fazem parte da alteração;
- conter a alteração solicitada já integrada;
- não usar marcadores como “restante do código”, “código anterior” ou equivalentes;
- indicar claramente o nome e o caminho do arquivo correspondente;
- estar pronto para revisão ou substituição conforme a autorização recebida.

Arquivos com mais de 800 linhas podem ser apresentados em partes numeradas para facilitar a revisão e evitar cortes.

Quando houver divisão:

- todas as partes devem ser entregues;
- as partes devem estar numeradas e em ordem;
- os limites entre as partes devem ser claros;
- nenhum trecho pode ser omitido;
- a combinação das partes deve reproduzir exatamente o arquivo completo.

## 11. Proteção de credenciais e dados sensíveis

O arquivo `.env` é estritamente protegido.

É proibido:

- abrir ou ler o `.env`;
- pesquisar dentro do `.env`;
- exibir seu conteúdo;
- copiar seu conteúdo;
- alterar seu conteúdo;
- formatar seu conteúdo;
- incluir seu conteúdo em comandos, logs, respostas ou relatórios;
- enviar seu conteúdo para serviços externos;
- adicionar o `.env` ao Git;
- usar credenciais encontradas no `.env`.

A verificação de que o `.env` está protegido pelo `.gitignore` deve ser feita sem abrir ou revelar o conteúdo do arquivo.

Também é proibido exibir ou transmitir senhas, tokens, chaves de API, cookies, segredos, credenciais ou dados pessoais encontrados em qualquer parte do projeto.

Se uma tarefa depender de credenciais, o agente deve interromper o trabalho e pedir orientação, sem tentar localizar ou revelar os valores.

## 12. Arquivos que nunca devem ser versionados

Nunca adicionar ao controle de versão:

- o arquivo `.env`;
- outros arquivos que contenham credenciais ou segredos;
- o diretório `node_modules`;
- arquivos temporários;
- arquivos de cache;
- logs gerados localmente;
- artefatos locais sem necessidade de versionamento;
- cópias de segurança locais;
- exportações de banco de dados com informações reais;
- dados pessoais, confidenciais ou operacionais de clientes;
- documentos ou arquivos enviados por clientes;
- qualquer material sensível não destinado ao repositório.

Antes de qualquer operação autorizada de preparação de commit, verificar se esses itens estão protegidos pelas regras de ignore e se nenhum deles está incluído nas alterações versionadas.

Se qualquer item sensível aparecer no estado do Git ou no diff, interromper o trabalho e informar o responsável sem revelar seu conteúdo.

## 13. Uso controlado do Git

Antes de qualquer edição, o estado do Git deve ser verificado com comandos somente de leitura.

Comandos estritamente de leitura, como `git status`, `git diff`, `git log`, `git branch --show-current` e `git remote -v`, podem ser executados sem autorização adicional.

É proibido executar sem autorização explícita:

- `git pull`;
- `git push`;
- `git commit`;
- `git merge`;
- `git reset`;
- `git rebase`;
- `git checkout`;
- `git switch`;
- `git restore`;
- `git clean`;
- `git stash`;
- `git fetch`;
- `git add`;
- `git rm`;
- criação, exclusão ou alteração de branches;
- criação ou exclusão de tags;
- alteração de remotos;
- alteração da configuração do Git;
- adição de arquivos ao índice;
- remoção de arquivos do índice;
- qualquer comando Git que modifique arquivos, índice, referências, branch, histórico, configuração ou estado do repositório.

Não assumir que uma autorização para editar arquivos inclui autorização para executar operações Git.

Cada operação Git que altere estado exige autorização específica.

Não descartar, sobrescrever ou incorporar alterações existentes sem identificar sua origem e receber autorização.

## 14. Requisitos antes de commit ou push

Antes de qualquer `git commit` ou `git push` autorizado, o agente deve apresentar ao responsável:

- o estado atual do Git;
- o `git diff` relevante;
- a lista completa dos arquivos envolvidos;
- um resumo claro das alterações;
- os testes executados;
- os resultados dos testes;
- quaisquer riscos, limitações ou testes que não puderam ser executados;
- a confirmação de que `.env`, `node_modules`, arquivos temporários e dados de clientes não estão incluídos.

Depois dessa apresentação, o agente deve aguardar autorização específica para executar o commit ou o push.

A autorização para commit não inclui autorização para push.

A autorização para push não deve ser presumida a partir de qualquer autorização anterior.

Se houver mudanças adicionais após a apresentação do diff, o diff e os testes devem ser apresentados novamente antes do commit ou push.

## 15. Exclusão e operações destrutivas

Não excluir arquivos ou diretórios sem autorização explícita e específica.

Não executar comandos destrutivos ou potencialmente irreversíveis.

Antes de qualquer exclusão autorizada, informar:

- o caminho exato do item;
- por que a exclusão é necessária;
- quais referências dependem dele;
- o impacto esperado;
- se existe possibilidade de recuperação;
- como a alteração será validada.

Nunca usar comandos destrutivos de escopo amplo.

## 16. Dependências

É proibido instalar, atualizar, remover ou substituir dependências sem autorização explícita.

Isso inclui, entre outros:

- `npm install`;
- `npm update`;
- `npm uninstall`;
- alterações manuais em arquivos de dependências;
- alterações em arquivos de lock;
- instalação de ferramentas globais;
- download ou execução de instaladores;
- migração de versões de bibliotecas ou frameworks.

Não modificar `package.json`, arquivos de lock ou configurações equivalentes sem autorização específica.

Se um teste exigir instalação ou atualização, interromper e solicitar autorização antes de executar.

## 17. Banco de dados e Supabase

Qualquer comando ou operação que altere banco de dados exige autorização explícita.

É proibido, sem autorização:

- criar, alterar ou excluir tabelas;
- criar, alterar ou excluir colunas;
- modificar índices, funções, gatilhos, views ou políticas;
- alterar permissões ou regras de Row Level Security;
- executar migrações;
- inserir, atualizar ou excluir dados;
- executar seeds;
- restaurar ou importar backups;
- alterar configurações do Supabase;
- executar comandos em ambiente local, homologação ou produção que modifiquem dados ou estrutura.

Alterações estruturais do Supabase devem ser registradas em arquivos SQL versionados no projeto.

Esses arquivos SQL devem:

- representar claramente a alteração estrutural;
- ser revisáveis;
- permitir rastreabilidade;
- evitar inclusão de credenciais ou dados reais de clientes;
- ser apresentados para autorização antes da execução;
- ser executados somente no ambiente autorizado;
- incluir, quando aplicável, uma estratégia segura de reversão.

Não realizar alterações estruturais apenas por meio do painel do Supabase sem o respectivo arquivo SQL versionado.

A criação ou alteração do arquivo SQL e a execução da mudança no Supabase são etapas distintas e exigem autorizações próprias.

## 18. Serviços externos

Qualquer comando ou ação que altere serviços externos exige autorização explícita.

Isso inclui, entre outros:

- criação, alteração ou exclusão de recursos;
- envio de mensagens ou notificações;
- publicação ou implantação;
- alteração de configurações;
- modificação de dados remotos;
- acionamento de integrações com efeitos reais;
- uso de APIs que produzam efeitos externos;
- alteração de ambientes de homologação ou produção.

Uma autorização para alterar arquivos locais não autoriza alterações em serviços externos.

Antes de qualquer ação externa autorizada, informar o serviço, a operação, o ambiente, os dados afetados, o risco e a forma de validação.

## 19. Comandos e testes

Executar somente os comandos e testes necessários para o micro passo autorizado.

Comandos estritamente de leitura podem ser executados sem autorização adicional, desde que não acessem o `.env`, não utilizem credenciais e não alterem qualquer estado local ou remoto.

Antes de executar um teste que possa:

- modificar arquivos;
- gerar artefatos;
- atualizar snapshots;
- alterar cache;
- acessar ou modificar serviços externos;
- usar credenciais;
- modificar banco de dados;
- instalar dependências;
- iniciar migrações;

o agente deve explicar o efeito esperado e solicitar autorização.

Não executar correções automáticas, formatadores ou comandos com opção de escrita sem autorização.

Resultados de testes não autorizam automaticamente novas alterações.

## 20. Escopo das autorizações

Toda autorização deve ser interpretada de forma restrita.

Uma autorização vale somente para:

- o micro passo apresentado;
- os arquivos informados;
- as alterações descritas;
- os comandos declarados;
- os testes indicados;
- os ambientes e serviços externos expressamente mencionados.

Qualquer mudança de escopo exige nova explicação e nova autorização.

Se durante a execução surgir a necessidade de afetar outro arquivo, executar outro comando ou adotar abordagem diferente, o agente deve interromper o trabalho e pedir autorização.

## 21. Dúvidas e riscos

Quando houver dúvida, ambiguidade ou risco de quebrar algo, o agente deve parar e perguntar antes de agir.

Isso se aplica especialmente quando:

- o pedido puder ser interpretado de mais de uma forma;
- a alteração puder afetar áreas protegidas;
- um arquivo compartilhado puder afetar admin, cliente ou páginas públicas;
- houver dependências entre arquivos não previstas;
- existirem mudanças locais feitas pelo responsável;
- o teste necessário puder alterar o ambiente;
- a solução exigir credenciais;
- houver risco de perda de dados;
- o impacto não puder ser determinado com segurança;
- a alteração ultrapassar o escopo autorizado.

Não preencher lacunas importantes com suposições.

## 22. Alterações existentes no projeto

Arquivos modificados, novos ou não rastreados encontrados no projeto devem ser tratados como trabalho pertencente ao responsável.

O agente não deve:

- sobrescrever essas alterações;
- descartá-las;
- restaurá-las;
- formatá-las;
- adicioná-las a commits;
- movê-las;
- incorporá-las ao próprio trabalho;

sem autorização explícita.

Se uma alteração existente entrar em conflito com a tarefa, interromper e informar o problema.

## 23. Comunicação obrigatória

As explicações devem ser claras, objetivas e verificáveis.

Antes de uma alteração, apresentar:

- objetivo do micro passo;
- arquivos afetados;
- mudança proposta;
- risco;
- plano de teste;
- comandos pretendidos;
- pedido explícito de autorização.

Depois de uma alteração, apresentar:

- arquivos efetivamente alterados;
- resumo exato das mudanças;
- diferenças relevantes;
- testes executados;
- resultados;
- estado atual do Git;
- pedido de validação antes de continuar.

Não declarar uma etapa concluída sem apresentar evidências compatíveis com a tarefa.

## 24. Hierarquia das instruções

As solicitações explícitas do responsável pelo projeto definem o escopo de cada tarefa, mas não anulam automaticamente estas regras.

Caso uma solicitação entre em conflito com este arquivo, o agente deve apontar o conflito e solicitar confirmação específica antes de prosseguir.

Regras de segurança, proteção de credenciais, proteção de dados de clientes e prevenção de perda de dados devem ser sempre preservadas.

## 25. Regra final

Nenhuma ação de escrita deve ser executada por iniciativa própria.

Comandos e operações estritamente de leitura são permitidos para analisar o projeto, exceto qualquer acesso ao `.env`.

Para qualquer alteração:

1. analisar;
2. explicar;
3. informar arquivos, riscos e testes;
4. solicitar autorização;
5. executar somente o micro passo autorizado;
6. apresentar o resultado;
7. aguardar validação antes de continuar.
