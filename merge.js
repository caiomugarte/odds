// mergeMarkets.js (versão otimizada com cheerio e normalização de linhas)
import fs from 'fs';
import * as cheerio from 'cheerio';

const round2 = v => v !== undefined && v !== null ? Math.round(v * 100) / 100 : v;

const pct2 = v => v !== undefined && v !== null ? Math.round(v * 10000) / 100 : v;

function normalize(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/\s*-\s*/g, ' - ')      // Garante espaço antes e depois do hífen
        .replace(/\s+/g, ' ')            // Remove espaços duplicados
        .trim();
}

function normalizeParticipante(p) {
    const norm = p.toLowerCase();
    if (norm.includes('acima') || norm.includes('mais')) return 'over';
    if (norm.includes('menos') || norm.includes('under')) return 'under';
    return norm;
}




function simplificaHandicap(linha) {
    if (!linha) return linha;
    linha = linha.replace(/\s+/g, '').replace(/^\++/, '+'); // Remove whitespace and extra "+" signs

    const format = (num) => {
        const parsed = parseFloat(num);
        if (isNaN(parsed)) return num;
        const rounded = Math.round(parsed * 4) / 4;
        return (rounded > 0 ? '+' : '') + rounded.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    };

    if (!linha.includes(',')) return format(linha);

    const partes = linha.split(',').map(p => parseFloat(p));
    if (partes.length === 2 && partes.every(n => !isNaN(n))) {
        const media = (partes[0] + partes[1]) / 2;
        return format(media);
    }

    return linha;
}


const mercadoMap = {
    'handicap - partida': [
        'handicap asiatico',
        'handicap asiatico - mais opcoes',
        // Add all full match variants you see in Bet365
    ],
    'handicap - 1º tempo': [
        'handicap asiatico - 1º tempo',
        '1º tempo - handicap asiatico - mais alternativas',
        '1º tempo - handicap asiatico - mais opcoes',
        '1º tempo - handicap asiatico',
        '1º tempo handicap asiatico',
        '1º tempo - handicap asiatico - mais alternativas',
        '1º tempo - handicap asiático - mais alternativas',
        '1º tempo - handicap asiático - mais opções',
        '1º tempo - handicap asiático',
        '1º tempo handicap asiático',
        // Add all first half variants you see in Bet365
    ],
    'total - partida': [
        'gols +/ -',
        'gols +/-',
        'gols +/- - mais alternativas',
        'total de gols',
        'total - partida'
        // Add any other variants you see in Bet365 or Pinnacle
    ],
    'total -1º tempo': ['1º tempo gols + ou -', '1º tempo - gols +/- - mais alternativas'],
    'handicap (escanteios) - partida': ['handicap asiatico - escanteios'],
    'total (escanteios) - partida': ['total (escanteios) - partida'],
    'total (escanteios) - 1º tempo': [
        '1º tempo - escanteios asiaticos',
        '1º tempo - escanteios asiáticos',
        '1º tempo escanteios asiaticos',
        '1º tempo escanteios asiáticos',
        '1º tempo - escanteios',
        'escanteios - 1º tempo',
        '1º tempo - escanteios asiáticos'
    ],
    'total (cartões) - partida': [
        'total de cartões asiáticos'
    ],
    'handicap (cartões) - partida': [
        'handicap asiático - cartões'
    ]
};

function fillCenteredOdds($, pod, mercados, titulo) {
    $(pod).find('.gl-Market').each((_, bloco) => {
        const header = $(bloco).find('.gl-MarketColumnHeader').first().text().trim();
        $(bloco).find('.gl-ParticipantCentered').each((_, opt) => {
            let linha = $(opt).find('.gl-ParticipantCentered_Handicap').text().trim();
            if (!linha) return;
            linha = simplificaHandicap(linha);
            const odd = $(opt).find('.gl-ParticipantCentered_Odds').text().trim();
            if (linha && odd && header) {
                //console.log('header:', header, 'linha:', linha, 'odd:', odd);
                mercados.push({
                    mercado: titulo,
                    participante: header,
                    linha,
                    odd: parseFloat(odd.replace(',', '.')),
                    casa: 'bet365'
                });
            }
        });
    });
}

function fillCs2Markets($, pod, mercados, titulo) {
    const linhas = [];
    const colunas = [];

    // Pega os rótulos à esquerda (ex: Para Ganhar, Handicap da Partida...)
    $(pod).find('.gl-Market .srb-ParticipantLabel_Name').each((_, el) => {
        linhas.push($(el).text().trim());
    });

    // Pega os nomes dos times nas colunas (ignorando a primeira coluna que é vazia)
    $(pod).find('.gl-MarketColumnHeader').each((i, el) => {
        const nome = $(el).text().trim();
        if (nome !== '') {
            colunas.push(nome);
        }
    });

    // Para cada coluna de time (ex: MongolZ, FURIA)
    $(pod).find('.gl-Market').each((colIndex, colEl) => {
        // Ignora a primeira coluna de labels
        if (colIndex === 0) return;

        const nomeTime = colunas[colIndex - 1]; // alinhado com os labels

        $(colEl).find('.srb-ParticipantCenteredStackedMarketRow').each((rowIndex, rowEl) => {
            const linhaNome = linhas[rowIndex] || `Linha ${rowIndex + 1}`;

            const oddEl = $(rowEl).find('.srb-ParticipantCenteredStackedMarketRow_Odds');
            const handicapEl = $(rowEl).find('.srb-ParticipantCenteredStackedMarketRow_Handicap');

            const odd = oddEl.text().trim().replace(',', '.');
            const linha = handicapEl.length ? handicapEl.text().trim() : linhaNome;

            if (odd) {
                mercados.push({
                    mercado: titulo,
                    participante: nomeTime,
                    linha: simplificaHandicap(linha),
                    odd: parseFloat(odd),
                    casa: 'bet365'
                });
            }
        });
    });
}



function fillOverUnderMarkets($, pod, mercados, titulo) {
    const lines = [];
    $(pod).find('.srb-ParticipantLabelCentered_Name').each((_, el) => {
        lines.push($(el).text().trim());
    });

    const maisOdds = [];
    $(pod).find('.gl-MarketColumnHeader:contains("Mais de")').parent().find('.gl-ParticipantOddsOnly_Odds').each((_, el) => {
        maisOdds.push($(el).text().trim());
    });

    const menosOdds = [];
    $(pod).find('.gl-MarketColumnHeader:contains("Menos de")').parent().find('.gl-ParticipantOddsOnly_Odds').each((_, el) => {
        menosOdds.push($(el).text().trim());
    });

    for (let i = 0; i < lines.length; i++) {
        if (maisOdds[i]) {
            mercados.push({
                mercado: titulo,
                participante: 'Mais de',
                linha: simplificaHandicap(lines[i]),
                odd: parseFloat(maisOdds[i].replace(',', '.')),
                casa: 'bet365'
            });
        }
        if (menosOdds[i]) {
            mercados.push({
                mercado: titulo,
                participante: 'Menos de',
                linha: simplificaHandicap(lines[i]),
                odd: parseFloat(menosOdds[i].replace(',', '.')),
                casa: 'bet365'
            });
        }
    }
}

function loadSoccerMarket(mercados, titulo, $, pod) {
    const tituloLower = titulo.toLowerCase();

    const shouldUseOverUnder = (
        tituloLower.includes('gols') ||
        (tituloLower.includes('total') && tituloLower.includes('escanteios')) ||
        (tituloLower.includes('1º tempo') && tituloLower.includes('escanteios') && tituloLower.includes('asiáticos')) ||
        (tituloLower.includes('cartões') && tituloLower.includes('asiáticos'))
    );

    if (shouldUseOverUnder) {
        fillOverUnderMarkets($, pod, mercados, titulo);
    } else {
        fillCenteredOdds($, pod, mercados, titulo);
    }
}

function loadCs2Market(mercados, titulo, $, pod) {
    const tituloLower = titulo.toLowerCase();
    fillCs2Markets($, pod, mercados, tituloLower);
}

function extractBet365Markets(html) {
    const $ = cheerio.load(html);
    const mercados = [];
    const breadcrumb = $('.sph-Breadcrumb').text();

    $('.gl-MarketGroupPod').each((_, pod) => {
        const titulo = $(pod).find('.cm-MarketGroupWithIconsButton_Text').first().text().trim();
        if (!titulo) return;
        if(breadcrumb.includes('Futebol')) {
            loadSoccerMarket(mercados, titulo, $, pod);
        }
        if(breadcrumb.includes('CS2')) {
            loadCs2Market(mercados, titulo, $, pod);
        }
    });
    return mercados;
}

function handleTotalMatchPinnacle($, section, mercados, titulo) {
    $(section).find('.OddStyled-sc-n6vnd1-0').each((_, button) => {
        const name = $(button).find('.name').text().trim(); // e.g., "Acima de 2.5"
        const odd = $(button).find('.odd').text().trim();
        let participante = '';
        let linha = '';
        if (name.toLowerCase().startsWith('acima de')) {
            participante = 'Acima de';
            linha = name.replace(/acima de/i, '').trim();
        } else if (name.toLowerCase().startsWith('menos de')) {
            participante = 'Menos de';
            linha = name.replace(/menos de/i, '').trim();
        }
        if (participante && linha && odd) {
            mercados.push({
                mercado: titulo,
                participante,
                linha: simplificaHandicap(linha),
                odd: parseFloat(odd.replace(',', '.')),
                casa: 'pinnacle'
            });
        }
    });
}

function extractPinnacleMarkets(html) {
    const $ = cheerio.load(html);
    const mercados = [];

    $('.SectionStyled-sc-o6nwof-0').each((_, section) => {
        const titulo = normalize($(section).find('.title').first().text().trim());

        if (titulo.includes('total da equipe')) return;

        // Special handling for "Total - Partida"
        if (titulo === 'total - partida') {
            handleTotalMatchPinnacle($, section, mercados, titulo);
            return; // Skip the rest for this section
        }

        if (normalize(titulo).includes('total')) {
            handleTotalMatchPinnacle($, section, mercados, titulo);
            return;
        }

        const participantes = $(section).find('.sub-header span').map((_, el) => $(el).text().trim()).get();

        // Get all odds in this section
        const odds = $(section).find('.OddStyled-sc-n6vnd1-0');
        odds.each((i, button) => {
            let linha = $(button).find('.name').text().trim();
            if (!linha) return;
            linha = simplificaHandicap(linha);
            const odd = $(button).find('.odd').text().trim();

            // If there are always two participants, alternate between them
            let participante = null;
            if (participantes.length === 2) {
                participante = participantes[i % 2];
            } else if (participantes.length === 1) {
                participante = participantes[0];
            } else {
                // fallback: try to extract from button or skip
                participante = $(button).find('.participant').text().trim() || '';
            }

            if(titulo.includes("money")){
                participante = linha;
                linha = "paraganhar"
            }

            if (titulo && linha && odd && participante) {
                mercados.push({
                    mercado: titulo,
                    participante,
                    linha,
                    odd: parseFloat(odd.replace(',', '.')),
                    casa: 'pinnacle'
                });
            }
        });
    });
    return mercados;
}

const MARKET_ALIASES = {
    // Handicap
    'handicappartida': 'handicap - partida',
    'handicapprimeirotempo': 'handicap - 1º tempo',
    'handicapasiatico': 'handicap - partida',
    'handicapasiaticoprimeirotempo': 'handicap - 1º tempo',
    'handicapasiaticomaisopcoes': 'handicap - partida',
    'primeirotempohandicapasiaticomaisalternativas': 'handicap - 1º tempo',

    // Total Gols
    'totalpartida': 'total - partida',
    'totalprimeirotempo': 'total - 1º tempo',
    'gols+/': 'total - partida',
    'gols+/maisalternativas': 'total - partida',
    'primeirotempogols+ou': 'total - 1º tempo',
    'primeirotempogols+/maisalternativas': 'total - 1º tempo',

    // Escanteios Total
    'totalescanteiospartida': 'total (escanteios) - partida',
    'totalescanteiosprimeirotempo': 'total (escanteios) - 1º tempo',
    'totaldeescanteiosasiaticos': 'total (escanteios) - partida',
    'primeirotempoescanteiosasiaticos': 'total (escanteios) - 1º tempo',

    // Escanteios Handicap
    'handicapescanteiospartida': 'handicap (escanteios) - partida',
    'handicapasiaticoescanteios': 'handicap (escanteios) - partida',

    'totalcartoespartida': 'total (cartões) - partida',
    'totaldecartoesasiaticos': 'total (cartões) - partida',
    'handicapasiaticocartoes': 'handicap (cartões) - partida',
    'handicapcartoespartida': 'handicap (cartões) - partida',

    //cs2
    'handicapmapa1': 'handicap - mapa 1',
    'totalmapa1': 'total - mapa 1',
    'handicapmapa2': 'handicap - mapa 2',
    'totalmapa2': 'total - mapa 2',
    'rodadalinhas': 'rodada - linhas',
    'mapa1linhas': 'mapa 1 - linhas',
    'mapa1primeirotempo': 'mapa 1 - 1° tempo',
    'mapa2linhas': 'mapa 2 - linhas',
    'mapa2primeirotempo': 'mapa 2 - 1° tempo',
    'linhasdapartida': 'money line - partida',
    'moneylinepartida': 'money line - partida'
};

function normalizeMarketName(market) {
    const slug = normalize(market)
        .replace(/[\s\-()]/g, '') // Remove espaços, hífens e parênteses
        .replace(/1º|1o/g, 'primeiro') // Substitui notações com número por palavra
        .toLowerCase();

    if (MARKET_ALIASES[slug]) {
        return MARKET_ALIASES[slug];
    }

    console.log('[normalizeMarketName] No mapping for:', market, '->', slug);
    return market; // fallback
}




function getOppositeLine(line) {
    // Flip the sign for Asian Handicap lines
    if (!line) return line;
    if (line.startsWith('+')) return '-' + line.slice(1);
    if (line.startsWith('-')) return '+' + line.slice(1);
    return line; // for 0, stays 0
}

function getOppositeParticipant(participante, participantesUnicos) {
    // Normalize all for comparison
    const normParticipante = normalize(participante);
    for (const p of participantesUnicos) {
        if (normalize(p) !== normParticipante) return p;
    }
    return null;
}

function normalizeTeamName(name) {
    return name
        ?.normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\(.*?\)/g, '') // Remove "(ESCANTEIOS)" ou outros sufixos
        .toLowerCase()
        .split(' ')
        .slice(0, 2)
        .join(' ')
        .trim();
}

function mergeMarkets(bet365Data, pinnacleData) {
    const oportunidades = [];
    const pinMap = new Map();


    // Unificando participantes únicos
    const participantesUnicos = Array.from(new Set([
        ...bet365Data.map(m => m.participante),
        ...pinnacleData.map(m => m.participante)
    ]));

    const pinList = pinnacleData.map(pin => ({
        mercado:  normalizeMarketName(pin.mercado),
        participante: normalizeMarketName(pin.mercado).includes('total')
            ? normalizeParticipante(pin.participante, participantesUnicos)
            : normalizeTeamName(pin.participante),
        linha: normalize(pin.linha),
        odd: pin.odd
    }));

    pinnacleData.forEach(pin => {
        const normMarket = normalizeMarketName(pin.mercado);
        const normParticipante = normMarket.includes('total')
            ? normalizeParticipante(pin.participante, participantesUnicos)
            : normalizeTeamName(pin.participante);

        const normLinha = normalize(pin.linha);
        const key = `${normMarket}|${normParticipante}|${normLinha}`;
        //console.log(`[KEY DEBUG] ${"pinnacle"}: ${key}`);
        if (!pinMap.has(key)) {
            pinMap.set(key, pin);
        } else {
            const current = pinMap.get(key);
            const isBetter = !isNaN(pin.odd) && (!current || pin.odd < current.odd);
            if (isBetter) {
                console.warn('[mergeMarkets] Replacing key due to better odd:', key, '| Old:', current.odd, '| New:', pin.odd);
                pinMap.set(key, pin);
            } else {
                console.warn('[mergeMarkets] Skipping duplicate key in pinMap:', key, '| Existing:', current.odd, '| Skipped:', pin.odd);
            }
        }
    });

    bet365Data.forEach(bet => {
        const mercadoBet = normalizeMarketName(bet.mercado);
        const participanteBet = mercadoBet.includes('total')
            ? normalizeParticipante(bet.participante, participantesUnicos)
            : normalizeTeamName(bet.participante);
        const linhaBet = normalize(bet.linha);
        const key = `${mercadoBet}|${participanteBet}|${linhaBet}`;
        if (mercadoBet.includes('escanteios') && mercadoBet.includes('1º tempo')) {
            console.log('[DEBUG] Normalized Bet365:', {
                mercadoOriginal: bet.mercado,
                mercadoNormalizado: mercadoBet,
                participante: participanteBet,
                linha: linhaBet,
                keyUsada: key
            });
        }

        const match = pinMap.get(key);
        if (!match && mercadoBet.includes('escanteios') && mercadoBet.includes('1º tempo')) {
            console.log('[DEBUG] NENHUMA CHAVE ENCONTRADA PARA:', key);
            console.log('[DEBUG] CHAVES DISPONÍVEIS:');
            for (const k of pinMap.keys()) {
                if (k.startsWith(mercadoBet)) {
                    console.log('  ', k);
                }
            }
        }


        if (match) {
            let oppositeParticipante, oppositeLinha;
            if (mercadoBet.includes('total')) {
                // For totals, opposite is "acima de" <-> "menos de", same line
                if (normalizeParticipante(bet.participante) === 'over') {
                    oppositeParticipante = 'under';
                } else if (normalizeParticipante(bet.participante) === 'under') {
                    oppositeParticipante = 'over';
                } else {
                    oppositeParticipante = getOppositeParticipant(bet.participante, participantesUnicos);
                }
                oppositeLinha = bet.linha;
            } else {
                // For handicaps, opposite is other team, line sign flipped
                oppositeParticipante = getOppositeParticipant(bet.participante, participantesUnicos);
                oppositeLinha = getOppositeLine(bet.linha);
            }
            const normalizedOppositeParticipante = mercadoBet.includes('total')
                ? normalizeParticipante(oppositeParticipante)
                : normalizeTeamName(oppositeParticipante);
            const normalizedOppositeLinha = normalize(oppositeLinha);
            const oppositeKey = `${mercadoBet}|${normalizedOppositeParticipante}|${normalizedOppositeLinha}`;
            const oppositeMatch = pinList
                .filter(p => `${p.mercado}|${p.participante}|${p.linha}` === oppositeKey)
                .sort((a, b) => b.odd - a.odd)[0];

            //console.log('Looking for oppositeKey:', oppositeKey, 'in pinMap');
            if (!oppositeMatch) {
                //console.log('Available keys for market:', mercadoBet);
                pinMap.forEach((v, k) => {
                    if (k.startsWith(`${mercadoBet}|`)) {
                        //console.log('  ', k);
                    }
                });
            }

            let overround, probA_fair, probB_fair, EV, kelly, quarter_kelly, stake;
            let oddA = match.odd;
            let oddB = oppositeMatch ? oppositeMatch.odd : null;
            let bankroll = 265; // or any value you want

            if (oddA && oddB) {
                overround = (1/oddA) + (1/oddB);
                probA_fair = (1/oddA) / overround;
                probB_fair = (1/oddB) / overround;
                EV = (bet.odd * probA_fair) - 1;
                kelly = EV / (bet.odd - 1);
                quarter_kelly = kelly / 4;
                stake = quarter_kelly * bankroll;
            }

            const diff = parseFloat((bet.odd - match.odd).toFixed(3));
            oportunidades.push({
                mercado: bet.mercado,
                linha: bet.linha,
                participante: bet.participante,
                bet365: bet.odd,
                pinnacle: match.odd,
                pinnacle_opposite: oddB,
                participante_opposite: normalizedOppositeParticipante,
                linha_opposite: normalizedOppositeLinha,
                diferenca: diff,
                overround: round2(overround),
                probA_fair: round2(probA_fair),
                probB_fair: round2(probB_fair),
                EV: pct2(EV),
                kelly: pct2(kelly),
                quarter_kelly: pct2(quarter_kelly),
                stake: round2(stake)
            });

            //console.log('[DEBUG] Bet365 market:', bet.mercado, '-> Normalized:', mercadoBet);
            //console.log('Bet365 key:', key);
            //console.log('Pinnacle key:', key);

            if (mercadoBet === 'total (escanteios) - partida') {
                //console.log('Bet365 key:', key);
            }
        }
    });
    ////console.log(oportunidades)
    // Only keep opportunities where Bet365's odd is higher than Pinnacle's
    const oportunidadesPositivas = oportunidades.filter(o => o.diferenca > 0 && o.EV >= 3);

    return oportunidadesPositivas.sort((a, b) => b.diferenca - a.diferenca);
}

const bet365Html = fs.readFileSync('./bet365.html', 'utf-8');
const pinnacleHtml = fs.readFileSync('./pinnacle.html', 'utf-8');

const bet365Markets = extractBet365Markets(bet365Html);
const pinnacleMarkets = extractPinnacleMarkets(pinnacleHtml);

const comparacoes = mergeMarkets(bet365Markets, pinnacleMarkets);

console.log(JSON.stringify(comparacoes, null, 2));

const comparacoesComStake = comparacoes.filter(o => o.stake > 0 && o.quarter_kelly > 0.25);

console.log('--- COMPARAÇÕES COM STAKE POSITIVA ---');
console.log(JSON.stringify(comparacoesComStake, null, 2));
