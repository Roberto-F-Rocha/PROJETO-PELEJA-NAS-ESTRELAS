# Peleja nas Estrelas

Um jogo de ação em navegador inspirado na paisagem, nas cores e no imaginário do sertão nordestino. Pilote a **Nave Carcará**, atravesse cinco pelejas e derrote o **Coronel do Vazio**.

## Como jogar

- **WASD** ou **setas**: mover a nave
- **Espaço** ou **Enter**: atirar
- **P** ou **Esc**: pausar/continuar
- **M**: ativar/desativar som
- No celular, use os controles de toque ou arraste a nave diretamente na tela.

Durante a jornada, inimigos podem liberar três reforços:

- **Água (+):** recupera uma vida, até o máximo de cinco;
- **Escudo (◆):** absorve dano temporariamente;
- **Rajada (»):** aumenta a velocidade e duplica os disparos.

## Recursos

- Campanha completa com cinco níveis e batalha final;
- Dificuldade progressiva, três classes de inimigo e chefe;
- Sistema de combo, bônus, partículas e efeitos sonoros sintetizados;
- Recorde persistido no navegador;
- Controles para teclado, mouse e telas sensíveis ao toque;
- Pausa automática ao trocar de aba;
- Interface responsiva e acessível;
- Arte procedural própria, sem dependência de assets externos em tempo de execução.

## Desenvolvimento

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Validação completa:

```bash
npm run check
```

O comando executa lint, testes unitários e o build de produção. O projeto também possui um fluxo do GitHub Actions para publicar automaticamente no GitHub Pages após atualizações na branch `main`.

## Tecnologias

React 18, Vite 6, Canvas API, Web Audio API e CSS responsivo.

## Autoria

Criado por [Roberto F. Rocha](https://github.com/Roberto-F-Rocha). Licenciado sob a licença MIT.
