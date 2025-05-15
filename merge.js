// mergeMarkets.js (versão otimizada com cheerio e normalização de linhas)
import fs from 'fs';
import * as cheerio from 'cheerio';

const round2 = v => v !== undefined && v !== null ? Math.round(v * 100) / 100 : v;

const pct2 = v => v !== undefined && v !== null ? Math.round(v * 10000) / 100 : v;

function normalize(text) {
    return text
        ?.normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/(^|\s)([+-])?0*(\d+\.\d+|\d+)/g, '$2$3')
        .replace(/([+-])\1+/g, '$1')
        .toLowerCase()
        .trim();
}

function normalizeParticipante(nome, referenciaLista = []) {
    let normNome = normalize(nome);
    if (['mais de', 'acima de'].includes(normNome)) normNome = 'acima de';
    if (normNome === 'menos de') normNome = 'menos de';

    for (const ref of referenciaLista) {
        const normRef = normalize(ref);
        if (
            (normNome === 'acima de' && ['mais de', 'acima de'].includes(normRef)) ||
            (normNome === 'menos de' && normRef === 'menos de')
        ) {
            return ref; // keep the name as it appears
        }
    }
    return nome;
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
    'handicap -1º tempo': [
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
    'total (escanteios) -1º tempo': ['1º tempo - escanteios asiaticos']
};

function extractBet365Markets(html) {
    const $ = cheerio.load(html);
    const mercados = [];

    $('.gl-MarketGroupPod').each((_, pod) => {
        const titulo = $(pod).find('.cm-MarketGroupWithIconsButton_Text').first().text().trim();
        console.log('Bet365 market title:', titulo);
        if (!titulo) return;

        if (titulo.toLowerCase().includes('gols')) {
            // Find all lines (e.g., 2.0, 2.5, etc.)
            const lines = [];
            $(pod).find('.srb-ParticipantLabelCentered_Name').each((_, el) => {
                lines.push($(el).text().trim());
            });

            // Find all "Mais de" odds
            const maisOdds = [];
            $(pod).find('.gl-MarketColumnHeader:contains("Mais de")').parent().find('.gl-ParticipantOddsOnly_Odds').each((_, el) => {
                maisOdds.push($(el).text().trim());
            });

            // Find all "Menos de" odds
            const menosOdds = [];
            $(pod).find('.gl-MarketColumnHeader:contains("Menos de")').parent().find('.gl-ParticipantOddsOnly_Odds').each((_, el) => {
                menosOdds.push($(el).text().trim());
            });

            // For each line, add both "Mais de" and "Menos de" as separate markets
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
            return; // Skip the rest of the loop for this pod
        }

        if (titulo.toLowerCase().includes('total') && titulo.toLowerCase().includes('escanteios')) {
            console.log('DEBUG: HTML for Total de Escanteios Asiáticos:', $(pod).html());
            // Find the line (e.g., 9.5, 10.5, etc.)
            const lines = [];
            $(pod).find('.srb-ParticipantLabelCentered_Name').each((_, el) => {
                lines.push($(el).text().trim());
            });

            // Find all "Mais de" odds
            const maisOdds = [];
            $(pod).find('.gl-MarketColumnHeader:contains("Mais de")').parent().find('.gl-ParticipantOddsOnly_Odds').each((_, el) => {
                maisOdds.push($(el).text().trim());
            });

            // Find all "Menos de" odds
            const menosOdds = [];
            $(pod).find('.gl-MarketColumnHeader:contains("Menos de")').parent().find('.gl-ParticipantOddsOnly_Odds').each((_, el) => {
                menosOdds.push($(el).text().trim());
            });

            // For each line, add both "Mais de" and "Menos de" as separate markets
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
            return; // Skip the rest of the loop for this pod
        }

        if (titulo.toLowerCase().includes('escanteios') && titulo.toLowerCase().includes('asiaticos')) {
            // Find the line (e.g., 9.5)
            let line = null;
            $(pod).find('.gl-Market').each((_, bloco) => {
                const header = $(bloco).find('.gl-MarketColumnHeader').first().text().trim();
                if (header === '' || header === '&nbsp;') {
                    // This block contains the line
                    line = $(bloco).find('.srb-ParticipantLabelCentered_Name').first().text().trim();
                }
            });
            if (!line) return;

            // Now find the odds for "Mais de" and "Menos de"
            let maisOdd = null, menosOdd = null;
            $(pod).find('.gl-Market').each((_, bloco) => {
                const header = $(bloco).find('.gl-MarketColumnHeader').first().text().trim();
                const odd = $(bloco).find('.gl-ParticipantOddsOnly_Odds').first().text().trim();
                if (header === 'Mais de') maisOdd = odd;
                if (header === 'Menos de') menosOdd = odd;
            });

            if (maisOdd) {
                mercados.push({
                    mercado: titulo,
                    participante: 'Mais de',
                    linha: (line.startsWith('+') ? '' : '+') + simplificaHandicap(line),
                    odd: parseFloat(maisOdd.replace(',', '.')),
                    casa: 'bet365'
                });
            }
            if (menosOdd) {
                mercados.push({
                    mercado: titulo,
                    participante: 'Menos de',
                    linha: (line.startsWith('+') ? '' : '+') + simplificaHandicap(line),
                    odd: parseFloat(menosOdd.replace(',', '.')),
                    casa: 'bet365'
                });
            }
            return; // Skip the rest of the loop for this pod
        }

        $(pod).find('.gl-Market').each((_, bloco) => {
            const header = $(bloco).find('.gl-MarketColumnHeader').first().text().trim();
            $(bloco).find('.gl-ParticipantCentered').each((_, opt) => {
                let linha = $(opt).find('.gl-ParticipantCentered_Handicap').text().trim();
                if (!linha) return;
                linha = simplificaHandicap(linha);
                const odd = $(opt).find('.gl-ParticipantCentered_Odds').text().trim();
                if (linha && odd && header) {
                    console.log('header:', header, 'linha:', linha, 'odd:', odd);
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
    });
    console.log('--- Bet365 Markets ---');
    mercados.forEach(m => console.log(m.mercado));
    return mercados;
}

function extractPinnacleMarkets(html) {
    const $ = cheerio.load(html);
    const mercados = [];

    $('.SectionStyled-sc-o6nwof-0').each((_, section) => {
        const titulo = $(section).find('.title').first().text().trim();

        // Special handling for "Total - Partida"
        if (normalize(titulo) === 'total - partida') {
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
            return; // Skip the rest for this section
        }

        if (normalize(titulo).includes('total')) {
            $(section).find('.OddStyled-sc-n6vnd1-0').each((_, button) => {
                const name = $(button).find('.name').text().trim();
                const odd = $(button).find('.odd').text().trim();

                if (!name.toLowerCase().startsWith('acima de') && !name.toLowerCase().startsWith('menos de')) {
                    return; // Skip entries like "Team A", "1º Tempo", etc.
                }

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

function normalizeMarketName(market) {
    const norm = normalize(market);

    // First, check for escanteios (corners) markets
    if (norm.includes('escanteios') && norm.includes('total')) {
        console.log('[normalizeMarketName] Pattern match', market, '-> total (escanteios) - partida');
        return 'total (escanteios) - partida';
    }
    if (norm.includes('escanteios') && norm.includes('handicap')) {
        console.log('[normalizeMarketName] Pattern match', market, '-> handicap (escanteios) - partida');
        return 'handicap (escanteios) - partida';
    }

    // Then check for other markets
    // First half Asian Handicap
    if (norm.includes('1º tempo') && norm.includes('handicap') && norm.includes('asiatico')) {
        console.log('[normalizeMarketName] Pattern match', market, '-> handicap -1º tempo');
        return 'handicap -1º tempo';
    }
    // Full match Asian Handicap
    if (!norm.includes('1º tempo') && norm.includes('handicap') && norm.includes('asiatico')) {
        console.log('[normalizeMarketName] Pattern match', market, '-> handicap - partida');
        return 'handicap - partida';
    }
    // First half team total
    if (norm.includes('1º tempo') && norm.includes('gols')) {
        console.log('[normalizeMarketName] Pattern match', market, '-> total -1º tempo');
        return 'total -1º tempo';
    }
    // Full match team total
    // First half team total
    if (norm.includes('1º tempo') && (norm.includes('gols') || norm.includes('total'))) {
        console.log('[normalizeMarketName] Pattern match', market, '-> total -1º tempo');
        return 'total -1º tempo';
    }

// Full match team total
    if ((norm.includes('gols') || norm.includes('total'))) {
        console.log('[normalizeMarketName] Pattern match', market, '-> total - partida');
        return 'total - partida';
    }


    if (norm.includes('handicap') && norm.includes('asiatico') && norm.includes('mais')) {
        return 'handicap - partida';
    }

    if (norm.includes('gols') && norm.includes('alternativas')) {
        return 'total - partida';
    }

    if (norm.includes('total') && norm.includes('1º tempo')) {
        return 'total -1º tempo';
    }


    // Fallback to old mapping for other markets
    for (const [pinnacle, bet365List] of Object.entries(mercadoMap)) {
        for (const bet365 of bet365List) {
            if (norm.includes(normalize(bet365))) {
                console.log('[normalizeMarketName] Mapping', market, '->', pinnacle);
                return normalize(pinnacle);
            }
        }
    }
    console.log('[normalizeMarketName] No mapping for', market, '->', norm);
    return norm;
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
    // Remove accents, lowercase, and take only the first two words
    return name
        ?.normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
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
        mercado: normalizeMarketName(pin.mercado),
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
        const match = pinMap.get(key);

        if (match) {
            let oppositeParticipante, oppositeLinha;
            if (mercadoBet.includes('total')) {
                // For totals, opposite is "acima de" <-> "menos de", same line
                if (normalize(bet.participante) === 'mais de' || normalize(bet.participante) === 'acima de') {
                    oppositeParticipante = 'menos de';
                } else if (normalize(bet.participante) === 'menos de') {
                    oppositeParticipante = 'acima de';
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
                ? normalizeParticipante(oppositeParticipante, participantesUnicos)
                : normalizeTeamName(oppositeParticipante);
            const normalizedOppositeLinha = normalize(oppositeLinha);
            const oppositeKey = `${mercadoBet}|${normalizedOppositeParticipante}|${normalizedOppositeLinha}`;
            const oppositeMatch = pinList
                .filter(p => `${p.mercado}|${p.participante}|${p.linha}` === oppositeKey)
                .sort((a, b) => b.odd - a.odd)[0];

            console.log('Looking for oppositeKey:', oppositeKey, 'in pinMap');
            if (!oppositeMatch) {
                console.log('Available keys for market:', mercadoBet);
                pinMap.forEach((v, k) => {
                    if (k.startsWith(`${mercadoBet}|`)) {
                        console.log('  ', k);
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

            console.log('[DEBUG] Bet365 market:', bet.mercado, '-> Normalized:', mercadoBet);
            console.log('Bet365 key:', key);
            console.log('Pinnacle key:', key);

            if (mercadoBet === 'total (escanteios) - partida') {
                console.log('Bet365 key:', key);
            }
        }
    });
    //console.log(oportunidades)
    // Only keep opportunities where Bet365's odd is higher than Pinnacle's
    const oportunidadesPositivas = oportunidades.filter(o => o.diferenca > 0);

    return oportunidadesPositivas.sort((a, b) => b.diferenca - a.diferenca);
}

const bet365Html = fs.readFileSync('./bet365.html', 'utf-8');
const pinnacleHtml = fs.readFileSync('./pinnacle.html', 'utf-8');

const bet365Markets = extractBet365Markets(bet365Html);
const pinnacleMarkets = extractPinnacleMarkets(pinnacleHtml);

const comparacoes = mergeMarkets(bet365Markets, pinnacleMarkets);

console.log(JSON.stringify(comparacoes, null, 2));