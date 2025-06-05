const axios = require('axios');
const fs = require('fs').promises;

const OUTPUT_FILE = 'odds_previas.json';
const RESUMO_FILE = 'quedas_resumo.json';
const SPORT_ID = 29;
const DELAY_MIN_MS = 500;
const DELAY_MAX_MS = 2000;
const API_KEY = 'CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R';
const DROP_THRESHOLD_PERCENT = 3;

function americanToDecimal(price) {
    return price > 0 ? (price / 100) + 1 : (100 / Math.abs(price)) + 1;
}

function classifyMarket(marketType, period) {
    let tipo = marketType;
    if (period === 1) tipo += ' (1º Tempo)';
    return tipo;
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchLeagues() {
    const url = `https://guest.api.arcadia.pinnacle.com/0.1/sports/${SPORT_ID}/leagues?all=false&brandId=0`;
    const headers = { 'x-api-key': API_KEY };
    const res = await axios.get(url, { headers });
    return res.data.map(league => ({ id: league.id, name: league.name }));
}

async function fetchMarkets(leagueId) {
    const url = `https://guest.api.arcadia.pinnacle.com/0.1/leagues/${leagueId}/markets/straight`;
    const headers = { 'x-api-key': API_KEY };
    try {
        const res = await axios.get(url, { headers });
        return res.data;
    } catch (err) {
        console.error(`Erro ao buscar mercados da liga ${leagueId}:`, err.message);
        return [];
    }
}

async function fetchMatchups(leagueId) {
    const url = `https://guest.api.arcadia.pinnacle.com/0.1/leagues/${leagueId}/matchups?brandId=0`;
    const headers = { 'x-api-key': API_KEY };
    try {
        const res = await axios.get(url, { headers });
        return res.data;
    } catch (err) {
        console.error(`Erro ao buscar matchups da liga ${leagueId}:`, err.message);
        return [];
    }
}

async function monitor() {
    let previousOdds = {};
    let quedasResumo = {};

    try {
        const data = await fs.readFile(OUTPUT_FILE, 'utf-8');
        previousOdds = JSON.parse(data);
    } catch {
        console.log('Nenhum arquivo anterior encontrado, criando um novo...');
    }

    const leagues = await fetchLeagues();
    console.log(`🔍 Monitorando TODAS as quedas (exceto jogos ao vivo)`);

    const matchupInfo = {};

    for (const league of leagues) {
        const [marketData, matchups] = await Promise.all([
            fetchMarkets(league.id),
            fetchMatchups(league.id)
        ]);

        for (const m of matchups) {
            let participants = m.participants;
            if (m.parent && m.parent.participants) {
                participants = m.parent.participants;
            }

            const home = participants.find(p => p.alignment === 'home')?.name ?? 'Equipe A';
            const away = participants.find(p => p.alignment === 'away')?.name ?? 'Equipe B';

            matchupInfo[m.id] = {
                home,
                away,
                startTime: m.startTime,
                participants,
                specialDescription: m.special?.description ?? m.type,
                isLive: m.isLive ?? false
            };
        }

        for (const market of marketData) {
            const info = matchupInfo[market.matchupId] || {};
            if (info.isLive) continue; // Ignora jogos ao vivo

            const marketDesc = classifyMarket(market.type + (info.specialDescription ? ` - ${info.specialDescription}` : ''), market.period);

            for (const [index, price] of market.prices.entries()) {
                if(price.points == null) continue;
                const confronto = info.home && info.away ? `${info.home} vs ${info.away}` : `Matchup ${market.matchupId}`;

                let participantKey = price.designation ?? 'undefined';
                if ((!participantKey || participantKey === 'undefined') && info.participants) {
                    let participant = info.participants.find(p => p.rotation === market.rotation || p.rotation === price.rotation);
                    if (!participant && info.specialDescription) {
                        participant = info.participants.find(p => info.specialDescription.includes(p.name));
                    }
                    if (!participant) {
                        participant = info.participants[index];
                    }
                    participantKey = participant?.name ?? participant?.id ?? 'undefined';
                }

                const key = [
                    `matchup:${market.matchupId}`,
                    `type:${market.type}`,
                    `side:${market.side ?? '-'}`,  // <- isso aqui é o que faltava
                    `period:${market.period}`,
                    `participant:${participantKey}`,
                    `line:${price.points ?? '-'}`,
                    `designation:${price.designation ?? '-'}`,
                    `rotation:${price.rotation ?? '-'}`,
                ].join('|');
                const decimalOdd = americanToDecimal(price.price);

                if (previousOdds[key]) {
                    const previousOdd = previousOdds[key].odd;
                    const dropPercent = ((previousOdd - decimalOdd) / previousOdd) * 100;
                    if (dropPercent >= DROP_THRESHOLD_PERCENT) {
                        if (!quedasResumo[confronto]) {
                            quedasResumo[confronto] = {
                                liga: league.name,
                                totalQuedas: 0,
                                detalhes: []
                            };
                        }
                        quedasResumo[confronto].totalQuedas += 1;
                        quedasResumo[confronto].detalhes.push({
                            mercado: marketDesc,
                            periodo: market.period,
                            linha: price.points ?? '-',
                            participante: participantKey,
                            oddAnterior: previousOdds[key].odd.toFixed(2),
                            oddAtual: decimalOdd.toFixed(2),
                            percentualQueda: dropPercent.toFixed(1),
                            horario: info.startTime ?? 'desconhecido'
                        });
                    }
                }

                previousOdds[key] = {
                    odd: decimalOdd,
                    leagueName: league.name,
                    confronto,
                    mercado: marketDesc,
                    participante: participantKey,
                    linha: price.points ?? '-',
                    startTime: info.startTime ?? 'desconhecido'
                };
            }
        }

        const randomDelay = Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1)) + DELAY_MIN_MS;
        await delay(randomDelay);
    }

    console.log(`\n🔎 Resumo das quedas (jogos não ao vivo):`);
    Object.entries(quedasResumo).forEach(([confronto, data]) => {
        console.log(`📍 ${confronto} (${data.liga}) - Total de quedas: ${data.totalQuedas}`);
    });

    await fs.writeFile(OUTPUT_FILE, JSON.stringify(previousOdds, null, 2));
    await fs.writeFile(RESUMO_FILE, JSON.stringify(quedasResumo, null, 2));
    console.log(`💾 Odds salvas em ${OUTPUT_FILE}`);
    console.log(`💾 Resumo salvo em ${RESUMO_FILE}`);

    setTimeout(monitor, 60 * 1000);
}

monitor();