/* =====================================================================
   POKEWORLD UNIVERSE — dados das subpáginas (mock local)
   ===================================================================== */
window.PWU = window.PWU || {};

/* ---------- Notícias ---------- */
PWU.news = [
  {
    slug: 'live-coins-live-store',
    tag: 'Novidade', date: '2026-10-06', featured: true, hero: true,
    url: 'noticia-live-coins.html',
    image: 'assets/img/banners-20261012/BannerTwitchRecompensa.jpg', banner: true,
    gallery: ['assets/img/live-news-20261006/boost-xp-140.png', 'assets/img/live-news-20261006/boost-loot-140.png', 'assets/img/live-news-20261006/boost-catch-140.png', 'assets/img/live-news-20261006/boost-shiny-140.png'],
    coin: 'assets/img/live-news-20261006/livecoin-44.png', coinLabel: 'Live Coins',
    highlight: 'recompensas no PWU',
    cover: 'assets/img/banners-20261012/BannerTwitchRecompensa.jpg',
    promo: { badge: 'Live Coins', badgeIcon: 'assets/img/live-news-20261006/livecoin-44.png', title: 'Ganhe recompensas no PWU ao fazer suas lives', highlight: 'Ganhe recompensas', label: 'Como participar', href: 'noticia-live-coins.html#como-participar' },
    title: 'Suas lives agora valem recompensas no PWU',
    excerpt: 'Acompanhe os nossos parceiros na Twitch, acumule Live Coins e use as moedas na Live Store, dentro do jogo.',
    body: [
      'Funciona assim: você assiste às lives dos parceiros do PokeWorld Universe, junta Live Coins enquanto acompanha e depois troca as moedas na Live Store por itens exclusivos com tema Twitch, como mochilas e cosméticos para o seu treinador.',
      'Quanto mais você acompanha, mais você leva. É a nossa forma de valorizar quem apoia os streamers e a comunidade, e de dar um motivo a mais para ficar de olho nas hunts, nos eventos e nas novidades que passam ao vivo.',
      '> Parceiros, horários e regras para ganhar moedas saem no Discord e no Instagram do PWU. Ative as notificações!'
    ]
  },
  {
    slug: 'notas-de-balanceamento', pinned: true,
    tag: 'Atualização', date: '2026-10-12',
    image: 'assets/img/banners-20261012/Balanceamento.jpg', banner: true,
    title: 'Notas de Balanceamento',
    excerpt: 'Nossa equipe está trabalhando para você escolher seus favoritos e aproveitar o jogo com o máximo de diversão.',
    body: [
      'Pokémon das Classes I e II ganham ajustes de vida e ataque para seguirem fortes no meio do jogo. Já os golpes de área das Classes IV e V perdem um pouco de força, porque estavam passando por cima das raridades Épsilon e Beta.',
      'O Rage também foi revisto: nos níveis Base, Savage, Apex e Oblivion, experiência e drops ficaram proporcionais ao desafio. Quanto mais difícil a hunt, maior a recompensa. A captura das Classes III a V foi ajustada, e os lendários seguem raros de propósito.',
      '> Achou algo fora da curva depois do patch? Conta pra gente no Discord, no canal de sugestões.'
    ]
  },
  {
    slug: 'passe-de-batalha', pinned: true,
    tag: 'Novidade', date: '2026-10-10',
    image: 'assets/img/banners-20261012/GamePass.jpg', banner: true,
    title: 'Passe de Batalha: para você desfrutar do melhor',
    excerpt: 'O Passe de Batalha chega ao PokeWorld Universe com cosméticos e itens únicos para quem joga todo dia.',
    body: [
      'A cada missão diária do passe concluída, você sobe de nível e abre novas cartas de recompensa: cosméticos, itens exclusivos e benefícios dentro do jogo. É uma forma de ganhar algo especial só por jogar do seu jeito, todos os dias.',
      'O visual do passe segue a identidade do PWU, com cartas que revelam as recompensas a cada etapa. Quem começa cedo aproveita mais a temporada e garante itens que não voltam depois.',
      '> Comece pelos cosméticos e itens únicos e acompanhe as novidades do passe no nosso Discord.'
    ]
  },
  {
    slug: 'sistema-de-guild', pinned: true,
    tag: 'Novidade', date: '2026-10-09',
    image: 'assets/img/banners-20261012/SistemaGuild.jpg', banner: true,
    title: 'Sistema de Guild: crie a sua guild para dominar o PWU',
    excerpt: 'Chegou a hora de juntar a turma: crie a sua guild e domine o PWU ao lado dos seus amigos.',
    body: [
      'Avance sua guild para receber buffs que ajudam todos os membros nas hunts e para enfrentar bosses excepcionais, que desafiam quem evolui em grupo. Quanto mais forte a guild, maior o desafio e melhor a recompensa.',
      'Toda guild tem missões e recompensas diárias para fazer em conjunto, e os pontos conquistados alimentam o ranking de guildas. A cada temporada, as melhores colocadas ganham recompensas sazonais exclusivas.',
      '> Chame seus amigos, escolha o nome da guild e comece a sua história no PWU.'
    ]
  },
  {
    slug: 'top-ranking', pinned: true,
    tag: 'Novidade', date: '2026-10-08',
    image: 'assets/img/banners-20261012/TopRanking2.jpg', banner: true,
    title: 'Top Ranking: prove que você é o melhor deste universo',
    excerpt: 'Seja o melhor para ganhar recompensas sazonais! O Top Ranking é a vitrine de quem manda no PokeWorld Universe.',
    body: [
      'O ranking funciona por temporadas: você soma pontos de acordo com o seu desempenho e, quando a temporada termina, os primeiros colocados recebem recompensas exclusivas. Cada posição do pódio tem o seu prêmio, e os quatro primeiros aparecem em destaque.',
      'As recompensas de temporada não voltam depois: quem ficou com o título ou o item é porque estava lá. A cada nova temporada o placar zera, então quem entra agora tem a mesma chance de quem já joga há mais tempo.',
      '> Prove que você é o melhor deste universo e alcance o Top Ranking para vencer!'
    ]
  },
  {
    slug: 'abertura-pokeworld-universe',
    tag: 'Novidade', date: '2026-11-20', featured: true,
    image: 'assets/img/banners-20261012/LumioseCity.jpg', banner: true,
    title: 'O PokeWorld Universe abre em [data]',
    excerpt: 'Servidor de Pokémon com cliente próprio, desenvolvido pela nossa equipe, e uma perspectiva que dá profundidade ao mundo. PWU City inteira, Pokédex das três primeiras gerações e muito mais no dia da abertura.',
    body: [
      'O PokeWorld Universe abre em [data]. É um servidor de Pokémon com cliente próprio, desenvolvido pela nossa equipe, e uma perspectiva que dá profundidade ao mundo.',
      'Os melhores exemplos disso são a nova perspectiva dos pokémon e a nossa PWU City. Construímos a cidade inteira: torre central, bairros ao redor e hunts espalhadas pelos pontos que todo fã reconhece, em uma escala bem maior que a original. Quem já viu nos filmes e jogos identifica de cara; quem nunca viu vai passar um bom tempo só andando por ela.',
      '## O que estará disponível no dia da abertura:',
      '- Pokédex com as três primeiras gerações completas, todas com versão shiny.',
      '- Sistema de catch com chances visíveis e histórico de tentativas.',
      '- Evolução por pedras e condições, completa e funcional.',
      '- Sistema de ascensão estelar e helds.',
      '- Guildas com sistema interativo de bosses e buffs.',
      '- Tasks com recompensas progressivas.',
      '- Ginásios e líderes com mecânicas próprias de cada tipo.',
      '- Dungeons com níveis de dificuldade.',
      '- Montarias e voo livre pelo mapa.',
      '- Market com interface nova e atualizada.',
      '- Loot highlight, rastreador de Pokédex, rastreador de catch, extensão de container e coletar tudo.',
      'As contas já podem ser criadas em pokeworlduniverse.com, e quem criar antes de [data] entra com [bônus de estreia]. Ranking zerado, mundo novo, todo mundo começando junto.',
      'Discord: discord.gg/pokeworlduniverse · Instagram: @pokeworlduniverse'
    ]
  },
  {
    slug: 'temporada-12-regiao-aurora',
    tag: 'Atualização', date: '2026-11-04', featured: false,
    image: 'assets/img/news/article-15.jpg',
    title: 'Temporada 12 chega com a região Aurora e 6 novos Pokémon',
    excerpt: 'A maior atualização do ano abre uma região inteira para explorar, com clima dinâmico, novas rotas e um Passe de Aventura recheado.',
    body: [
      'A Temporada 12 do Pokeworld Universe começa hoje e traz a região Aurora, uma área ao norte do mapa com montanhas nevadas, cavernas de cristal e um vilarejo costeiro cheio de missões.',
      'Seis Pokémon chegam ao jogo nesta temporada, incluindo Ceruledge, Armarouge e Tinkaton. Cada um deles pode ser capturado nas novas rotas ou obtido pelo Passe de Aventura, que agora conta com 60 níveis de recompensas.',
      'O clima dinâmico afeta as batalhas: tempestades de neve reduzem a visibilidade e fortalecem golpes do tipo Gelo, enquanto a aurora boreal aumenta a chance de encontros raros durante a noite.',
      'A atualização já está disponível para iOS, Android, Nintendo Switch e PC. Basta abrir o jogo e baixar o pacote de conteúdo pela tela inicial.'
    ]
  },
  {
    slug: 'campeonato-mundial-2026',
    tag: 'Evento', date: '2026-10-28',
    image: 'assets/img/news/article-24.jpg',
    title: 'Campeonato Mundial 2026: inscrições abertas para as classificatórias',
    excerpt: 'Treinadores de todo o Brasil podem se inscrever até 15 de novembro. A final acontece em São Paulo com transmissão ao vivo.',
    body: [
      'As classificatórias regionais do Campeonato Mundial Pokeworld 2026 estão com inscrições abertas. Qualquer treinador com nível 20 ou mais pode participar diretamente pelo menu Ranking dentro do jogo.',
      'As partidas seguem o formato melhor de três, com banimentos alternados de Pokémon. Os 16 melhores de cada região avançam para a etapa nacional, que será disputada presencialmente em São Paulo.',
      'Além do troféu, o campeão leva 1 milhão de moedas Aeos, um traje exclusivo para o avatar e um Pikachu Campeão com coroa dourada.'
    ]
  },
  {
    slug: 'balanceamento-outubro',
    tag: 'Atualização', date: '2026-10-21',
    image: 'assets/img/news/article-17.jpg',
    title: 'Notas de balanceamento: Raichu de Alola, Gengar e Mewtwo recebem ajustes',
    excerpt: 'Ajustes focados em reduzir o poder de explosão no meio do jogo e dar mais espaço para Pokémon defensores.',
    body: [
      'Raichu de Alola teve o dano de Psíquico reduzido em 8% no nível 9, mas a velocidade de recarga de Voltagem Selvagem melhorou em 1 segundo.',
      'Gengar recebeu um leve aumento na cura de Drenar Sonho quando o alvo está com menos de 30% de vida, compensando a redução no dano de Bomba de Lodo.',
      'Mewtwo: o tempo de transformação Mega diminuiu, mas a redução de dano recebido durante a forma Mega caiu de 30% para 22%.',
      'Todos os ajustes já estão ativos nos servidores. Confira a lista completa na Wiki do site.'
    ]
  },
  {
    slug: 'colaboracao-champions',
    tag: 'Evento', date: '2026-09-30',
    image: 'assets/img/news/article-18.jpg',
    title: 'Evento de colaboração traz trajes e emblemas exclusivos por tempo limitado',
    excerpt: 'Complete missões diárias durante três semanas para desbloquear o Emblema do Campeão e trajes inspirados nos grandes torneios.',
    body: [
      'Até 21 de outubro, o evento de colaboração libera missões diárias e semanais com recompensas exclusivas. O Emblema do Campeão pode ser exibido no perfil e concede um efeito visual especial ao entrar nas partidas.',
      'Os trajes de Campeão para o avatar masculino e feminino são desbloqueados ao completar 15 missões, e a mochila temática ao atingir 25.'
    ]
  },
  {
    slug: 'guia-iniciante-time',
    tag: 'Comunidade', date: '2026-09-22',
    image: 'assets/img/news/article-20.jpg',
    title: 'Guia para iniciantes: como montar um time equilibrado',
    excerpt: 'Entenda as cinco funções dos Pokémon e por que uma equipe com Defensor e Suporte vence mais partidas.',
    body: [
      'Os Pokémon do Pokeworld Universe se dividem em cinco funções: Atacante, Versátil, Defensor, Suporte e Velocista. Um time equilibrado costuma ter pelo menos um Defensor e um Suporte para sustentar as lutas em torno dos objetivos.',
      'Atacantes como Pikachu e Gardevoir causam muito dano à distância, mas são frágeis. Velocistas como Zeraora e Talonflame são ótimos para roubar objetivos e eliminar alvos isolados.',
      'Comunique-se com o time usando os atalhos rápidos e concentre-se nos objetivos: pontuar importa mais do que eliminar.'
    ]
  },
  {
    slug: 'suicune-chega-ao-jogo',
    tag: 'Novidade', date: '2026-09-15',
    image: 'assets/img/news/article-22.jpg',
    title: 'Suicune chega ao Pokeworld como Atacante de longo alcance',
    excerpt: 'O lendário do tipo Água controla o campo com muralhas de gelo e pode ser desbloqueado com 14.000 moedas Aeos.',
    body: [
      'Suicune é um Atacante com foco em controle. Sua habilidade Névoa cria uma área que reduz a velocidade dos inimigos, enquanto Rajada de Gelo congela alvos atingidos duas vezes seguidas.',
      'A habilidade Unite, Vento Aurora, atravessa o mapa em linha reta e cura aliados no caminho.',
      'Disponível na Loja por 14.000 moedas Aeos ou 575 gemas.'
    ]
  },
  {
    slug: 'ranking-temporada-11-resultados',
    tag: 'Comunidade', date: '2026-09-03',
    image: 'assets/img/news/article-23.jpg',
    title: 'Resultados da Temporada 11: conheça os 10 melhores treinadores do Brasil',
    excerpt: 'A disputa pelo topo foi decidida nas últimas horas. Veja quem levou o título de Mestre Pokeworld.',
    body: [
      'A Temporada 11 terminou com um dos rankings mais disputados da história. Os três primeiros colocados trocaram de posição mais de vinte vezes na última semana.',
      'As recompensas de fim de temporada já foram enviadas para a caixa de correio dentro do jogo. Jogadores no rank Mestre recebem a moldura dourada e 3.000 moedas Aeos.'
    ]
  },
  {
    slug: 'nintendo-switch-cross-play',
    tag: 'Atualização', date: '2026-08-25',
    image: 'assets/img/news/article-13.jpg',
    title: 'Cross-play completo entre Switch, celular e PC já está disponível',
    excerpt: 'Seu progresso, amigos e itens acompanham você em qualquer plataforma. Basta vincular a conta Pokeworld.',
    body: [
      'A partir desta atualização, todas as plataformas compartilham as mesmas filas de partida. Jogadores de Nintendo Switch podem formar times com amigos no celular e no PC sem restrições.',
      'Para ativar, acesse Configurações > Conta e vincule seu e-mail Pokeworld. O progresso é sincronizado automaticamente.'
    ]
  },
  {
    slug: 'evento-halloween-gengar',
    tag: 'Evento', date: '2026-08-14',
    image: 'assets/img/news/article-16.jpg',
    title: 'Noite dos Fantasmas: evento de Halloween com Gengar Sombrio',
    excerpt: 'Mapa noturno, missões assustadoras e um holo-traje exclusivo de Gengar para quem completar o desafio.',
    body: [
      'De 20 a 31 de outubro, o mapa Estádio Central ganha uma versão noturna com abóboras que concedem bônus temporários. Gengar recebe o holo-traje Sombrio, com efeitos roxos em todas as habilidades.',
      'Complete 10 partidas no modo evento para desbloquear a moldura Noite dos Fantasmas.'
    ]
  },
  {
    slug: 'passe-de-aventura-guia',
    tag: 'Comunidade', date: '2026-08-02',
    image: 'assets/img/news/article-19.jpg',
    title: 'Vale a pena comprar o Passe de Aventura? Analisamos todas as recompensas',
    excerpt: 'São 60 níveis com trajes, moedas, gemas e itens de evolução. Fizemos as contas para você.',
    body: [
      'O Passe de Aventura custa 490 gemas e devolve 400 gemas ao longo dos 60 níveis, além de dois trajes, 8.000 moedas Aeos e itens de melhoria.',
      'Para jogadores que completam as missões semanais, o passe se paga sozinho até o nível 45.'
    ]
  },
  {
    slug: 'novos-mapas-vale-das-fontes',
    tag: 'Novidade', date: '2026-07-20',
    image: 'assets/img/news/article-21.jpg',
    title: 'Vale das Fontes: novo mapa de 5x5 com objetivos em constante mudança',
    excerpt: 'Fontes termais ativam bônus para o time que as controla e mudam de posição a cada dois minutos.',
    body: [
      'O Vale das Fontes é o terceiro mapa competitivo do Pokeworld Universe. As fontes termais concedem regeneração ao time que as controla, mas se movem pelo mapa ao longo da partida.',
      'O mapa entra na rotação ranqueada a partir da Temporada 12.'
    ]
  },
];

/* ---------- Notícias: bloco "Olha que incrível!" ---------- */
PWU.spotlight = {
  slug: 'ranking-temporada-11-resultados',
  image: 'assets/bg-arceus.png',
  label: 'Notícias',
  text: 'Confira os resultados completos da Temporada 11 e descubra quem são os 10 melhores treinadores do Brasil nesta edição emocionante. Esta temporada trouxe desafios intensos e batalhas memoráveis, destacando o talento e a estratégia dos competidores que se destacaram entre milhares.',
  discussions: [
    { topic: 'Buff no Pikachu? Ou Nerf?', text: 'Você acha que o Pikachu deveria receber um aumento de poder ou uma redução? Compartilhe sua opinião sobre como esse personagem deve ser ajustado para melhorar o equilíbrio do jogo.', when: '20 Set | 23h30m', href: 'https://discord.gg/pokeworlduniverse' },
    { topic: 'Qual o melhor time para iniciantes?', text: 'Defensor e Suporte vencem mais partidas ou um time só de Atacantes dá conta? Conte qual combinação funcionou para você nas primeiras rotas.', when: '18 Set | 21h10m', href: 'https://discord.gg/pokeworlduniverse' },
    { topic: 'Shiny hunting: vale a pena?', text: 'Horas de caçada por um brilho diferente. Mostre seu shiny mais raro e diga quanto tempo levou para capturar.', when: '15 Set | 19h45m', href: 'https://discord.gg/pokeworlduniverse' },
    { topic: 'Sugestões para a Temporada 12', text: 'A região Aurora está chegando. O que você quer ver no próximo Passe de Aventura e nos eventos da temporada?', when: '12 Set | 20h00m', href: 'https://discord.gg/pokeworlduniverse' }
  ]
};

/* ---------- Ranking ---------- */
PWU.ranking = [
  { pos: 1, name: 'Kyan_Maloka', team: 'Aurora Esports', avatar: 'gengar', points: 18420, wins: 412, rate: 71 },
  { pos: 2, name: 'Lippo.exe', team: 'Vale FC', avatar: 'zeraora', points: 17980, wins: 398, rate: 69 },
  { pos: 3, name: 'Nina_Frost', team: 'Aurora Esports', avatar: 'glaceon', points: 17310, wins: 377, rate: 68 },
  { pos: 4, name: 'Thalles_Z', team: 'Sem time', avatar: 'lucario', points: 16650, wins: 351, rate: 66 },
  { pos: 5, name: 'Bea.Trainer', team: 'Fênix', avatar: 'sylveon', points: 16120, wins: 340, rate: 65 },
  { pos: 6, name: 'DracoBR', team: 'Fênix', avatar: 'dragonite', points: 15800, wins: 333, rate: 64 },
  { pos: 7, name: 'Mirella_G', team: 'Vale FC', avatar: 'gardevoir', points: 15340, wins: 320, rate: 63 },
  { pos: 8, name: 'Rafa_Sombra', team: 'Sem time', avatar: 'zoroark', points: 15010, wins: 315, rate: 62 },
  { pos: 9, name: 'Juh_Storm', team: 'Aurora Esports', avatar: 'pikachu', points: 14720, wins: 309, rate: 62 },
  { pos: 10, name: 'PedroTank', team: 'Muralha', avatar: 'blastoise', points: 14480, wins: 301, rate: 61 },
  { pos: 11, name: 'Lua_Mimikyu', team: 'Muralha', avatar: 'mimikyu', points: 14100, wins: 296, rate: 60 },
  { pos: 12, name: 'Gui_Flame', team: 'Sem time', avatar: 'cinderace', points: 13850, wins: 290, rate: 60 },
  { pos: 13, name: 'Sofi_Heal', team: 'Fênix', avatar: 'blissey', points: 13560, wins: 284, rate: 59 },
  { pos: 14, name: 'Caio_Ninja', team: 'Vale FC', avatar: 'greninja', points: 13210, wins: 277, rate: 58 },
  { pos: 15, name: 'Ana_Psy', team: 'Sem time', avatar: 'mewtwo', points: 12980, wins: 270, rate: 58 },
  { pos: 16, name: 'Vitor_Steel', team: 'Muralha', avatar: 'metagross', points: 12640, wins: 265, rate: 57 },
  { pos: 17, name: 'Duda_Fada', team: 'Aurora Esports', avatar: 'clefable', points: 12300, wins: 258, rate: 56 },
  { pos: 18, name: 'Leo_Wing', team: 'Sem time', avatar: 'talonflame', points: 12010, wins: 252, rate: 56 },
  { pos: 19, name: 'Bruno_Rock', team: 'Fênix', avatar: 'tyranitar', points: 11750, wins: 246, rate: 55 },
  { pos: 20, name: 'Mel_Comfey', team: 'Vale FC', avatar: 'comfey', points: 11430, wins: 240, rate: 55 }
];

/* ---------- Rankings (4 categorias) ---------- */
PWU.rankingCats = [
  { id: 'experiencia', label: 'Experiência', unit: 'Level', desc: 'Treinadores com o maior level do servidor.' },
  { id: 'ganho', label: 'Ganho de experiência', unit: 'XP hoje', desc: 'Quem mais ganhou experiência nas últimas 24 horas.' },
  { id: 'mortes', label: 'Mortes', unit: 'Mortes', desc: 'Treinadores que mais derrotaram outros treinadores em PvP.' },
  { id: 'guildas', label: 'Guildas', unit: 'Pontos', desc: 'As guildas mais fortes do servidor: bosses, buffs e conquistas.' }
];
PWU.trophies = [1, 2, 3, 4, 5, 6, 7].map(function (t) { return 'assets/img/trophies/tier-' + t + '.png'; });
(function () {
  var names = ['Kyan_Maloka', 'Lippo.exe', 'Nina_Frost', 'Thalles_Z', 'Bea.Trainer', 'DracoBR', 'Mirella_G', 'Rafa_Sombra', 'Juh_Storm', 'PedroTank', 'Lua_Mimikyu', 'Gui_Flame', 'Sofi_Heal', 'Caio_Ninja', 'Ana_Psy', 'Vitor_Steel', 'Duda_Fada', 'Leo_Wing', 'Bruno_Rock', 'Mel_Comfey'];
  var guilds = ['Aurora Esports', 'Vale FC', 'Fênix', 'Muralha', 'Sem guilda'];
  var pool = ['blastoise', 'venusaur', 'pikachu', 'gengar', 'dragonite', 'gyarados', 'lucario', 'greninja', 'sylveon', 'umbreon', 'espeon', 'tyranitar', 'metagross', 'lapras', 'zeraora', 'mewtwo', 'mew', 'talonflame', 'scizor', 'alolan-raichu', 'gardevoir', 'mimikyu', 'glaceon', 'leafeon', 'vaporeon', 'snorlax'];
  function seed(n) { var x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); }
  function team(i, count) {
    var t = [];
    for (var k = 0; k < count; k++) {
      var id = pool[Math.floor(seed(i * 7 + k * 3) * pool.length)];
      if (id === 'snorlax') id = 'blissey';
      t.push({ id: id, lvl: 20 + Math.floor(seed(i * 11 + k) * 80), pct: Math.round(20 + seed(i * 13 + k * 5) * 79 * 10) / 10 });
    }
    return t;
  }
  function players(metricBase, step, shuffle) {
    return names.map(function (n, i) {
      var j = (i * shuffle) % names.length;
      return { name: names[j], guild: guilds[j % guilds.length], caught: 120 + Math.floor(seed(j * 3) * 300), team: team(j, 3 + Math.floor(seed(j) * 4)), value: Math.round(metricBase - i * step - seed(i) * step * 0.6) };
    });
  }
  PWU.rankings = {
    experiencia: players(109, 1.2, 1).map(function (p, i) { p.value = 109 - i; return p; }),
    ganho: players(184000, 6500, 7),
    mortes: players(1240, 48, 3),
    guildas: guilds.slice(0, 4).concat(['Sombra Lunar', 'Tempestade', 'Coração de Fogo', 'Maré Alta']).map(function (g, i) {
      return { name: g, guild: 'Líder: ' + names[(i * 5) % names.length], caught: 12 + Math.floor(seed(i) * 40), team: team(i + 40, 6), value: 98000 - i * 7400 - Math.round(seed(i * 2) * 3000), members: 12 + Math.floor(seed(i) * 40) };
    })
  };
})();

/* ---------- Pacotes de créditos — SÓ EXIBIÇÃO. O preço real vive no servidor (api/_lib/packages.js). ---------- */
PWU.coinPackages = [
  { id: 'plus', coins: 108, base: 100, price: 100, bonusPct: 8, bonus: 8 },
  { id: 'premium', coins: 168, base: 150, price: 150, bonusPct: 12, bonus: 18 },
  { id: 'master', coins: 236, base: 200, price: 200, bonusPct: 18, bonus: 36 },
  { id: 'ultra', coins: 500, base: 400, price: 400, bonusPct: 25, bonus: 100, badge: 'Mais popular' },
  { id: 'legend', coins: 1280, base: 1000, price: 1000, bonusPct: 28, bonus: 280 },
  { id: 'mythic', coins: 1950, base: 1500, price: 1500, bonusPct: 30, bonus: 450, badge: 'Melhor valor' }
];

/* ---------- Loja ---------- */
PWU.shop = [
  { id: 'suicune', type: 'pokemon', name: 'Suicune', desc: 'Atacante de longo alcance', coins: 14000, gems: 575, image: 'assets/img/pokemon/suicune.png', badge: 'Novo' },
  { id: 'miraidon', type: 'pokemon', name: 'Miraidon', desc: 'Atacante elétrico', coins: 14000, gems: 575, image: 'assets/img/pokemon/miraidon.png' },
  { id: 'ho-oh', type: 'pokemon', name: 'Ho-Oh', desc: 'Defensor lendário', coins: 12000, gems: 490, image: 'assets/img/pokemon/ho-oh.png' },
  { id: 'darkrai', type: 'pokemon', name: 'Darkrai', desc: 'Velocista das sombras', coins: 12000, gems: 490, image: 'assets/img/pokemon/darkrai.png' },
  { id: 'holo-gengar', type: 'traje', name: 'Holo-traje Gengar Sombrio', desc: 'Efeitos roxos em todas as habilidades', gems: 1050, image: 'assets/img/pokemon/gengar.png', badge: 'Evento' },
  { id: 'holo-pikachu', type: 'traje', name: 'Holo-traje Pikachu Campeão', desc: 'Coroa dourada e rastro de raios', gems: 1200, image: 'assets/img/pokemon/pikachu.png' },
  { id: 'holo-zacian', type: 'traje', name: 'Holo-traje Zacian Aurora', desc: 'Espada de cristal', gems: 2199, image: 'assets/img/pokemon/zacian.png', badge: 'Lendário' },
  { id: 'gems-1', type: 'gemas', name: '60 Gemas', desc: 'Pacote inicial', price: 4.90, image: 'assets/img/pokemon/comfey.png' },
  { id: 'gems-2', type: 'gemas', name: '350 Gemas', desc: '+35 de bônus', price: 24.90, image: 'assets/img/pokemon/alcremie.png' },
  { id: 'gems-3', type: 'gemas', name: '1.200 Gemas', desc: '+180 de bônus', price: 79.90, image: 'assets/img/pokemon/hoopa.png', badge: 'Popular' },
  { id: 'gems-4', type: 'gemas', name: '3.500 Gemas', desc: '+700 de bônus', price: 199.90, image: 'assets/img/pokemon/latias.png' },
  { id: 'passe', type: 'passe', name: 'Passe de Aventura T12', desc: '60 níveis de recompensas', gems: 490, image: 'assets/img/pokemon/mew.png', badge: 'Temporada' }
];

/* ---------- Wiki (Pokédex) ---------- */
PWU.roles = {
  atacante: { label: 'Atacante', color: '#ff6b4a' },
  versatil: { label: 'Versátil', color: '#c874ff' },
  defensor: { label: 'Defensor', color: '#5fd35f' },
  suporte: { label: 'Suporte', color: '#ffd84d' },
  velocista: { label: 'Velocista', color: '#4dc8ff' }
};
PWU.pokedex = [
  ['aegislash','Aegislash','versatil','melee',4], ['alcremie','Alcremie','suporte','ranged',2], ['alolan-ninetales','Ninetales de Alola','atacante','ranged',2],
  ['alolan-raichu','Raichu de Alola','atacante','ranged',3], ['armarouge','Armarouge','atacante','ranged',3], ['azumarill','Azumarill','versatil','melee',2],
  ['blastoise','Blastoise','defensor','ranged',3], ['blaziken','Blaziken','versatil','melee',4], ['blissey','Blissey','suporte','melee',1],
  ['buzzwole','Buzzwole','versatil','melee',3], ['ceruledge','Ceruledge','versatil','melee',4], ['chandelure','Chandelure','atacante','ranged',3],
  ['cinderace','Cinderace','atacante','ranged',1], ['clefable','Clefable','suporte','ranged',2], ['comfey','Comfey','suporte','ranged',2],
  ['darkrai','Darkrai','velocista','melee',4], ['decidueye','Decidueye','atacante','ranged',2], ['delphox','Delphox','atacante','ranged',3],
  ['dhelmise','Dhelmise','defensor','melee',3], ['dodrio','Dodrio','velocista','melee',3], ['dragapult','Dragapult','atacante','ranged',4],
  ['dragonite','Dragonite','versatil','melee',3], ['duraludon','Duraludon','atacante','ranged',3], ['empoleon','Empoleon','atacante','ranged',3],
  ['espeon','Espeon','atacante','ranged',2], ['falinks','Falinks','versatil','melee',3], ['galarian-rapidash','Rapidash de Galar','velocista','melee',3],
  ['gardevoir','Gardevoir','atacante','ranged',3], ['gengar','Gengar','velocista','melee',4], ['glaceon','Glaceon','atacante','ranged',2],
  ['goodra','Goodra','defensor','melee',2], ['greedent','Greedent','defensor','melee',2], ['greninja','Greninja','atacante','ranged',3],
  ['gyarados','Gyarados','versatil','melee',4], ['ho-oh','Ho-Oh','defensor','ranged',3], ['hoopa','Hoopa','suporte','ranged',4],
  ['inteleon','Inteleon','atacante','ranged',3], ['lapras','Lapras','defensor','ranged',2], ['latias','Latias','suporte','ranged',3],
  ['latios','Latios','velocista','ranged',3], ['leafeon','Leafeon','velocista','melee',2], ['lucario','Lucario','versatil','melee',4],
  ['mamoswine','Mamoswine','defensor','melee',2], ['meowscarada','Meowscarada','velocista','melee',4], ['metagross','Metagross','versatil','melee',3],
  ['mew','Mew','atacante','ranged',4], ['mewtwo','Mewtwo','atacante','ranged',3], ['mimikyu','Mimikyu','versatil','melee',3],
  ['miraidon','Miraidon','atacante','ranged',3], ['mr-mime','Mr. Mime','suporte','melee',3], ['pawmot','Pawmot','velocista','melee',3],
  ['pikachu','Pikachu','atacante','ranged',1], ['psyduck','Psyduck','suporte','ranged',2], ['sableye','Sableye','suporte','melee',4],
  ['scizor','Scizor','versatil','melee',3], ['suicune','Suicune','atacante','ranged',3], ['sylveon','Sylveon','atacante','ranged',1],
  ['talonflame','Talonflame','velocista','melee',2], ['tinkaton','Tinkaton','versatil','melee',3], ['trevenant','Trevenant','defensor','melee',2],
  ['tsareena','Tsareena','versatil','melee',3], ['tyranitar','Tyranitar','versatil','melee',3], ['umbreon','Umbreon','defensor','melee',2],
  ['urshifu','Urshifu','versatil','melee',4], ['vaporeon','Vaporeon','defensor','ranged',2], ['venusaur','Venusaur','atacante','ranged',2],
  ['zacian','Zacian','versatil','melee',4], ['zeraora','Zeraora','velocista','melee',3], ['zoroark','Zoroark','velocista','melee',4]
].map(function (r, i) {
  // estatísticas ilustrativas derivadas da função
  var base = { atacante: [90, 35, 55, 40, 70], versatil: [75, 65, 60, 45, 60], defensor: [45, 90, 85, 55, 35], suporte: [40, 55, 60, 95, 45], velocista: [70, 35, 45, 40, 95] }[r[2]];
  var j = (i * 7) % 13;
  return {
    id: r[0], name: r[1], role: r[2], range: r[3], difficulty: r[4],
    image: 'assets/img/pokemon/' + r[0] + '.png',
    description: r[1] + ' é um Pokémon ' + ({atacante:'atacante',versatil:'versátil',defensor:'defensor',suporte:'de suporte',velocista:'velocista'}[r[2]]) + ' de ' + (r[3]==='melee'?'curto':'longo') + ' alcance.',
    stats: { ataque: Math.min(100, base[0] + j), defesa: Math.min(100, base[1] + (j % 9)), resistencia: Math.min(100, base[2] + (j % 7)), suporte: Math.min(100, base[3] + (j % 5)), mobilidade: Math.min(100, base[4] + (j % 11)) }
  };
});

/* ---------- Textos editáveis pelo painel admin (chave -> valor padrão) ---------- */
PWU.texts = {
  'home.about.text': 'O PokeWorld Universe é um mundo Pokémon online moderno e <b>GRÁTIS</b>, que convida você a explorar regiões e cidades incríveis e colecionar pokémon únicos. Com cliente próprio desenvolvido pela nossa equipe, o jogo traz uma perspectiva que dá profundidade ao mundo e cidades construídas do zero, como a nossa PWU City.',
  'home.cta.title': 'Comece agora sua aventura no',
  'wiki.banner.title': 'Todas as<br>criaturas',
  'wiki.banner.sub': 'Funções, alcance, dificuldade e estatísticas de cada criatura disponível.',
  'noticias.banner.title': 'Últimas<br>notícias',
  'noticias.banner.sub': 'Atualizações, balanceamento, eventos e tudo o que acontece no Pokeworld.',
  'ojogo.intro.p1': 'Pokeworld Universe é um jogo online de batalhas em equipe. Dois times de cinco treinadores disputam uma arena, derrotam criaturas selvagens, acumulam energia e marcam pontos nos gols adversários antes do tempo acabar.',
  'ojogo.intro.p2': 'Cada criatura evolui durante a partida e desbloqueia novos golpes. A sinergia entre funções, o controle dos objetivos e a comunicação decidem quem sai vitorioso.'
};

PWU.fmtDate = function (iso) {
  var d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
};
PWU.brl = function (v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };

/* ---------- Avatares de perfil (só treinadores, sem Pokémon) ---------- */
PWU.avatares = [
  { name: 'Leon', image: 'assets/img/art/leon.png' },
  { name: 'Treinadora', image: 'assets/img/art/player-girl.png?v=3' },
  { name: 'Treinadora azul', image: 'assets/img/art/trainer-azul.png' },
  { name: 'Treinadora amarela', image: 'assets/img/art/trainer-amarela.png' }
];

/* ---------- Valor livre de doação (espelho da regra do servidor) ----------
   Aceita "137,50" ou "137.50". Entre R$ 10 e R$ 20.000. O bônus é o da maior
   faixa alcançada; abaixo de R$ 100 não há bônus. O servidor recalcula. */
PWU.valorLivre = function (txt) {
  var t = String(txt || '').trim().replace(/\s/g, '');
  if (!t) return null;
  if (t.indexOf(',') > -1) t = t.replace(/\./g, '').replace(',', '.');
  var price = Math.round(parseFloat(t) * 100) / 100;
  if (!(price >= 10 && price <= 20000)) return null;
  var pct = 0;
  (PWU.coinPackages || []).forEach(function (k) { if (price >= k.price && k.bonusPct > pct) pct = k.bonusPct; });
  var credits = Math.floor(price * (1 + pct / 100));
  return { price: price, bonusPct: pct, credits: credits };
};
