const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const SPORT_ID = 29;
const DELAY_MIN_MS = 500;
const DELAY_MAX_MS = 2000;
const API_KEY = 'CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R';
const RAW_DIR = './python/raw_pinnacle';
const CLASSIFIED_DIR = './classified_pinnacle';

const { program } = require('commander');

program
    .option('--all', 'Coleta de todos os jogos')
    .option('--hours <number>', 'Coleta de jogos das proximas X horas (padrão: 24)', '24')
    .parse(process.argv);

const options = program.opts();

// Configuração do axios para ignorar erros de certificado
const axiosInstance = axios.create({
    headers: {
        'x-api-key': API_KEY
    }
});

function isWithinTimeWindow(startTime, hours) {
    if (!startTime) return false;
    const matchTime = new Date(startTime);
    const now = new Date();
    const futureTime = new Date(now.getTime() + (hours * 60 * 60 * 1000));
    return matchTime >= now && matchTime <= futureTime;
}

function americanToDecimal(price) {
    return price > 0 ? (price / 100) + 1 : (100 / Math.abs(price)) + 1;
}

function getTipoFromMarketType(name) {
    if (!name) return 'desconhecido';
    const nome = name.toLowerCase();
    if (nome.includes('corner')) return 'Escanteios';
    if (nome.includes('booking') || nome.includes('card')) return 'Cartões';
    return 'Gols';
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchLeagues() {
    const url = `https://guest.api.arcadia.pinnacle.com/0.1/sports/${SPORT_ID}/leagues?all=false&brandId=0`;
    const headers = { 'x-api-key': API_KEY };
    const res = await axiosInstance.get(url);
    return res.data.map(league => ({ id: league.id, name: league.name }));
}

async function fetchMatchups(leagueId) {
    const url = `https://guest.api.arcadia.pinnacle.com/0.1/leagues/${leagueId}/matchups?brandId=0`;
    const headers = { 'x-api-key': API_KEY };
    try {
        const res = await axiosInstance.get(url);
        return res.data;
    } catch (err) {
        console.error(`Erro ao buscar matchups da liga ${leagueId}:`, err.message);
        return [];
    }
}

async function fetchRelated(matchupId) {
    const url = `https://guest.api.arcadia.pinnacle.com/0.1/matchups/${matchupId}/related`;
    const headers = { 'x-api-key': API_KEY };
    try {
        const res = await axiosInstance.get(url);
        return res.data;
    } catch (err) {
        console.error(`Erro ao buscar related do matchup ${matchupId}:`, err.message);
        return [];
    }
}

async function fetchMarketRelated(matchupId) {
    const url = `https://guest.api.arcadia.pinnacle.com/0.1/matchups/${matchupId}/markets/related/straight`;
    const headers = { 'x-api-key': API_KEY };
    try {
        const res = await axiosInstance.get(url);
        return res.data;
    } catch (err) {
        console.error(`Erro ao buscar market related do matchup ${matchupId}:`, err.message);
        return [];
    }
}

async function saveRawData(matchupId, relatedData, marketData) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const relatedPath = path.join(RAW_DIR, `related_${matchupId}_${timestamp}.json`);
    const marketPath = path.join(RAW_DIR, `pinnacle_${matchupId}_${timestamp}.json`);
    
    await fs.mkdir(RAW_DIR, { recursive: true });
    await fs.writeFile(relatedPath, JSON.stringify(relatedData, null, 2));
    await fs.writeFile(marketPath, JSON.stringify(marketData, null, 2));
}

async function processOdds(relatedData, marketData) {
    const matchupIdToTipo = new Map();
    const matchupIdToTeams = new Map();
    
    for (const entry of relatedData) {
        const tipo = getTipoFromMarketType(entry.league?.name || '');
        matchupIdToTipo.set(entry.id, tipo);
        
        // Extrai os nomes dos times
        if (entry.participants) {
            const homeTeam = entry.participants.find(p => p.alignment === 'home')?.name;
            const awayTeam = entry.participants.find(p => p.alignment === 'away')?.name;
            if (homeTeam && awayTeam) {
                matchupIdToTeams.set(entry.id, {
                    home: normalizeTeamName(homeTeam),
                    away: normalizeTeamName(awayTeam)
                });
            }
        }
    }

    const classificados = {
        Gols: [],
        Escanteios: [],
        Cartões: [],
        desconhecido: []
    };

    for (const market of marketData) {
        const tipo = matchupIdToTipo.get(market.matchupId) || 'desconhecido';
        const periodo = market.period === 1 ? '1º Tempo ' : '';
        const teams = matchupIdToTeams.get(market.matchupId) || { home: 'home', away: 'away' };

        if (['spread', 'total'].includes(market.type)) {
            for (const price of market.prices) {
                const participante = price.designation === 'home' ? teams.home : 
                                   price.designation === 'away' ? teams.away :
                                   price.designation;
                
                classificados[tipo].push({
                    mercado: `${periodo}${market.type === 'spread' ? 'Handicap' : 'Mais/Menos'}`,
                    participante: participante,
                    linha: price.points?.toString() ?? '-',
                    odd: americanToDecimal(price.price),
                    matchupId: market.matchupId
                });
            }
        }
    }

    return classificados;
}

function normalizeTeamName(name) {
    return name.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

async function monitor() {
    await fs.mkdir(CLASSIFIED_DIR, { recursive: true });
    console.log('🔍 Iniciando coleta de odds do Pinnacle...');
    
    const leagues = await fetchLeagues();
    console.log(`📊 Encontradas ${leagues.length} ligas`);

    for (const league of leagues) {
        console.log(`\n🏆 Processando liga: ${league.name}`);
        const matchups = await fetchMatchups(league.id);
        console.log(`📝 Encontrados ${matchups.length} jogos`);
        
        const filteredMatchups = options.all ? matchups : matchups.filter(m => isWithinTimeWindow(m.startTime, parseInt(options.hours)));
        console.log(`📝 Encontrados ${filteredMatchups.length} jogos (${matchups.length} total)`);
        for (const matchup of filteredMatchups) {
            if (matchup.isLive) {
                console.log(`⏭️  Pulando jogo ao vivo: ${matchup.id}`);
                continue;
            }

            console.log(`⏰ Horário: ${new Date(matchup.startTime).toLocaleString()}`);

            console.log(`\n🎮 Processando jogo: ${matchup.id}`);
            
            // Fetch related and market data
            const [relatedData, marketData] = await Promise.all([
                fetchRelated(matchup.id),
                fetchMarketRelated(matchup.id)
            ]);

            // Save raw data
            await saveRawData(matchup.id, relatedData, marketData);

            // Process and save classified odds
            const classificados = await processOdds(relatedData, marketData);
            const outputPath = path.join(CLASSIFIED_DIR, `pinnacle_classificado_${matchup.id}.json`);
            await fs.writeFile(outputPath, JSON.stringify(classificados, null, 2));

            // Random delay between requests
            /*const delayMs = Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS) + DELAY_MIN_MS);
            await delay(delayMs);*/
        }
    }

    console.log('\n✅ Coleta concluída!');
}

// Ensure the script runs continuously
async function run() {
    while (true) {
        try {
            await monitor();
            // Wait 5 minutes before next collection
            await delay(5 * 60 * 1000);
        } catch (error) {
            console.error('❌ Erro durante a coleta:', error);
            // Wait 1 minute before retrying on error
            await delay(60 * 1000);
        }
    }
}

run();