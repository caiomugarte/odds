import axios from 'axios';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const SPORT_ID = 29;
const API_KEY = 'CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R';

// Carrega o mapeamento de ligas e times
const leagueMapping = JSON.parse(readFileSync('./league_mapping.json', 'utf8'));
const teamMapping = JSON.parse(readFileSync('./team_mapping.json', 'utf8'));

// Configuração do axios
const axiosInstance = axios.create({
    headers: {
        'x-api-key': API_KEY
    }
});

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

// Função para extrair a liga do arquivo raw da Bet365
function extractLeagueFromRaw() {
    try {
        const rawFiles = readdirSync('./python/raw_bet365_asian')
            .filter(f => f.endsWith('.txt'));
        
        if (rawFiles.length === 0) {
            console.log('❌ Nenhum arquivo raw encontrado');
            return null;
        }
        
        const rawFile = rawFiles[0];
        const content = readFileSync(`./python/raw_bet365_asian/${rawFile}`, 'utf8');
        
        // Procura pela linha que contém a informação da liga
        const lines = content.split('|');
        for (const line of lines) {
            if (line.includes('CC=')) {
                const match = line.match(/CC=([^;]+)/);
                if (match) {
                    const leagueName = match[1];
                    console.log(`🏆 Liga encontrada na Bet365: "${leagueName}"`);
                    return leagueName;
                }
            }
        }
        
        console.log('❌ Não foi possível extrair a liga do arquivo raw');
        return null;
    } catch (error) {
        console.error('❌ Erro ao extrair liga:', error);
        return null;
    }
}

// Função para normalizar linhas
function normalizeLine(line) {
    if (!line || line === '-') return '0';
    return line.toString().trim();
}

// Função para normalizar nomes de mercados
function normalizeMarketName(name) {
    if (!name) return '';
    let normalized = name.toLowerCase()
        .replace('asiático', '')
        .replace(/alternativas/g, '') // remove a palavra alternativas
        .replace(/\s+/g, ' ')
        .replace('gols handicap', 'handicap')
        .replace('gols +/ -', 'mais/menos')
        .replace('gols +/-', 'mais/menos')
        .replace('gols ＋/-', 'mais/menos')
        .replace('total de gols', 'mais/menos')
        .replace('handicap - 1º tempo', '1º tempo handicap')
        .replace('1º tempo gols + ou -', '1º tempo mais/menos')
        .replace('total de escanteios', 'mais/menos')
        .replace('total de escanteios asiáticos', 'mais/menos')
        .replace('handicap - escanteios', 'handicap')
        .replace('1º tempo - escanteios', '1º tempo mais/menos')
        .replace('1º tempo - gols +/ -', '1º tempo mais/menos')
        .replace('1º tempo - handicap', '1º tempo handicap')
        .trim();

    // Remove qualquer 's' solto no final
    normalized = normalized.replace(/\s+s$/, '');

    // Remove qualquer traço ou espaço solto no final
    normalized = normalized.replace(/[-\s]+$/, '');

    return normalized;
}

// Função para verificar se é mercado de primeiro tempo
function isFirstHalfMarket(marketName) {
    return marketName.toLowerCase().includes('1º tempo');
}

// Função para verificar se os mercados são do mesmo tipo
function isSameMarketType(bet365Market, pinnacleMarket) {
    // Remove espaços extras e converte para minúsculo para comparação
    const b365 = bet365Market.toLowerCase().replace(/\s+/g, ' ').trim();
    const pin = pinnacleMarket.toLowerCase().replace(/\s+/g, ' ').trim();
    
    return b365 === pin;
}

// Função para verificar se o jogo está dentro da janela de tempo
function isWithinTimeWindow(startTime, hours = 48) {
    if (!startTime) return false;
    const matchTime = new Date(startTime);
    const now = new Date();
    const futureTime = new Date(now.getTime() + (hours * 60 * 60 * 1000));
    return matchTime >= now && matchTime <= futureTime;
}

// Função para obter o ID da Pinnacle baseado na liga da Bet365
function getPinnacleLeagueId(bet365League) {
    const mapping = leagueMapping[bet365League];
    if (mapping) {
        console.log(`🎯 Liga mapeada: "${bet365League}" -> Pinnacle ID: ${mapping.pinnacle_id}`);
        return mapping.pinnacle_id;
    }
    
    console.log(`⚠️ Liga não encontrada no mapeamento: "${bet365League}"`);
    return null;
}

// Função para normalizar nomes de times usando o mapeamento
function normalizeTeamNameWithMapping(name) {
    const normalizedName = name.toLowerCase().trim();
    
    // Primeiro, tenta encontrar no mapeamento (formato atual)
    for (const [canonicalName, variations] of Object.entries(teamMapping)) {
        if (Array.isArray(variations) && variations.includes(normalizedName)) {
            return canonicalName;
        }
        // Formato simplificado (string)
        else if (typeof variations === 'string' && variations === normalizedName) {
            return canonicalName;
        }
    }
    
    // Se não encontrar, tenta normalização inteligente
    const intelligentNormalized = intelligentNormalize(name);
    for (const [canonicalName, variations] of Object.entries(teamMapping)) {
        if (Array.isArray(variations) && variations.includes(intelligentNormalized)) {
            return canonicalName;
        }
        else if (typeof variations === 'string' && variations === intelligentNormalized) {
            return canonicalName;
        }
    }
    
    // Se não encontrar no mapeamento, usa a normalização básica
    return name.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace('corners', '')
        .replace('sp', '')
        .trim();
}

// Função para normalização inteligente
function intelligentNormalize(name) {
    return name.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/\s+/g, '')
        .replace('corners', '')
        .replace('sp', '')
        .trim();
}

// Função para normalizar participantes
function normalizeParticipant(name) {
    // Se for "over" ou "under", retorna como está
    if (name.toLowerCase() === 'over' || name.toLowerCase() === 'under') {
        return name.toLowerCase();
    }
    
    // Se for "mais de" ou "menos de", converte para over/under
    if (name.toLowerCase().includes('mais de')) {
        return 'over';
    }
    if (name.toLowerCase().includes('menos de')) {
        return 'under';
    }
    
    // Para nomes de times, usa o mapeamento
    return normalizeTeamNameWithMapping(name);
}

async function fetchMatchups(leagueId) {
    const url = `https://guest.api.arcadia.pinnacle.com/0.1/leagues/${leagueId}/matchups?brandId=0`;
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
    try {
        const res = await axiosInstance.get(url);
        return res.data;
    } catch (err) {
        console.error(`Erro ao buscar market related do matchup ${matchupId}:`, err.message);
        return [];
    }
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
                    home: normalizeTeamNameWithMapping(homeTeam),
                    away: normalizeTeamNameWithMapping(awayTeam)
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

// Função para encontrar jogo correspondente
function findMatchingGame(bet365Odds, pinnacleOdds) {
    // Pega os times do primeiro handicap da Bet365
    const bet365Handicap = bet365Odds.Gols.find(o => o.mercado === 'Handicap Asiático');
    if (!bet365Handicap) return null;

    // Normaliza o nome do time da Bet365
    const bet365Team = normalizeParticipant(bet365Handicap.participante);
    console.log(`🔍 Procurando jogo da Bet365: "${bet365Handicap.participante}" -> "${bet365Team}"`);

    // Procura nos jogos da Pinnacle
    for (const [matchupId, pinnacleData] of Object.entries(pinnacleOdds)) {
        const pinnacleHandicap = pinnacleData.Gols.find(o => o.mercado === 'Handicap');
        if (!pinnacleHandicap) continue;

        // Normaliza o nome do time do Pinnacle
        const pinnacleTeam = normalizeParticipant(pinnacleHandicap.participante);
        console.log(`  📍 Pinnacle ${matchupId}: "${pinnacleHandicap.participante}" -> "${pinnacleTeam}"`);

        // Compara os times normalizados
        if (pinnacleTeam === bet365Team) {
            console.log(`✅ Jogo encontrado! MatchupId: ${matchupId}`);
            return { matchupId, pinnacleData };
        }
    }

    console.log(`❌ Nenhum jogo correspondente encontrado para "${bet365Team}"`);
    return null;
}

// Função para comparar odds
function compareOdds(bet365Odds, pinnacleGame) {
    if (!pinnacleGame) {
        console.log('❌ Dados do Pinnacle não encontrados');
        return;
    }

    console.log('\n🔍 DEBUG - Estrutura dos dados:');
    console.log('Bet365 Gols:', bet365Odds.Gols?.length || 0, 'mercados');
    console.log('Pinnacle Gols:', pinnacleGame.Gols?.length || 0, 'mercados');
    console.log('Bet365 Escanteios:', bet365Odds.Escanteios?.length || 0, 'mercados');
    console.log('Pinnacle Escanteios:', pinnacleGame.Escanteios?.length || 0, 'mercados');

    // Debug: Mostra alguns exemplos de mercados
    if (bet365Odds.Gols && bet365Odds.Gols.length > 0) {
        console.log('\n📊 Exemplo Bet365 Gols:', bet365Odds.Gols[0]);
    }
    if (pinnacleGame.Gols && pinnacleGame.Gols.length > 0) {
        console.log('📊 Exemplo Pinnacle Gols:', pinnacleGame.Gols[0]);
    }

    const opportunities = [];

    // Função auxiliar para comparar mercados
    function compareMarkets(bet365Markets, pinnacleMarkets, tipo) {
        if (!Array.isArray(bet365Markets) || !Array.isArray(pinnacleMarkets)) {
            console.log(`❌ Dados inválidos para ${tipo}:`, { bet365: bet365Markets, pinnacle: pinnacleMarkets });
            return;
        }

        console.log(`\n🔍 Comparando ${tipo}: ${bet365Markets.length} vs ${pinnacleMarkets.length} mercados`);

        // Debug: Mostra mercados "Alternativas" da Bet365
        const alternativasMarkets = bet365Markets.filter(m => m.mercado.includes('Alternativas'));
        if (alternativasMarkets.length > 0) {
            console.log(`🔍 DEBUG - Mercados Alternativas encontrados (${alternativasMarkets.length}):`);
            alternativasMarkets.slice(0, 5).forEach(m => {
                const normalized = normalizeMarketName(m.mercado);
                console.log(`  "${m.mercado}" -> "${normalized}"`);
            });
        }

        // Debug: Mostra todos os mercados únicos da Bet365
        const uniqueBet365Markets = [...new Set(bet365Markets.map(m => m.mercado))];
        console.log(`🔍 DEBUG - Mercados únicos da Bet365 (${uniqueBet365Markets.length}):`);
        uniqueBet365Markets.slice(0, 10).forEach(m => {
            const normalized = normalizeMarketName(m);
            console.log(`  "${m}" -> "${normalized}"`);
        });

        // Debug: Conta quantos mercados alternativos passaram pela comparação
        let alternativasProcessed = 0;
        let alternativasWithMatches = 0;

        for (const bet365Odd of bet365Markets) {
            const isBet365FirstHalf = isFirstHalfMarket(bet365Odd.mercado);
            
            // Debug: Conta mercados alternativos
            if (bet365Odd.mercado.includes('Alternativas')) {
                alternativasProcessed++;
            }
            
            const pinnacleOdd = pinnacleMarkets.find(p => {
                const isPinnacleFirstHalf = isFirstHalfMarket(p.mercado);
                
                // Só compara se ambos forem do mesmo tipo (primeiro tempo ou jogo todo)
                if (isBet365FirstHalf !== isPinnacleFirstHalf) return false;
                
                // Normaliza os nomes dos mercados e participantes para comparação
                const bet365Market = normalizeMarketName(bet365Odd.mercado);
                const pinnacleMarket = normalizeMarketName(p.mercado);
                
                // Verifica se são do mesmo tipo de mercado
                if (!isSameMarketType(bet365Market, pinnacleMarket)) return false;
                
                const bet365Participant = normalizeParticipant(bet365Odd.participante);
                const pinnacleParticipant = normalizeParticipant(p.participante);
                
                // Normaliza as linhas para comparação
                const bet365Line = normalizeLine(bet365Odd.linha);
                const pinnacleLine = normalizeLine(p.linha);
                
                const mercadoMatch = bet365Market === pinnacleMarket;
                const participanteMatch = bet365Participant === pinnacleParticipant;
                const linhaMatch = pinnacleLine === bet365Line;
                
                if (mercadoMatch && participanteMatch && linhaMatch) {
                    console.log(`✅ Match encontrado: ${tipo} - ${bet365Odd.mercado} (${bet365Odd.linha})`);
                    console.log(`   Bet365: ${bet365Odd.odd} | Pinnacle: ${p.odd}`);
                    
                    // Debug: Conta matches de alternativas
                    if (bet365Odd.mercado.includes('Alternativas')) {
                        alternativasWithMatches++;
                    }
                }
                
                return mercadoMatch && participanteMatch && linhaMatch;
            });

            if (pinnacleOdd && bet365Odd.odd > pinnacleOdd.odd) {
                // Encontra a odd contrária na Pinnacle
                const pinnacleOppositeOdd = pinnacleMarkets.find(p => {
                    const isPinnacleFirstHalf = isFirstHalfMarket(p.mercado);
                    if (isPinnacleFirstHalf !== isFirstHalfMarket(pinnacleOdd.mercado)) return false;
                    
                    const pinnacleMarket = normalizeMarketName(p.mercado);
                    const pinnacleParticipant = normalizeParticipant(p.participante);
                    const pinnacleLine = normalizeLine(p.linha);
                    
                    // Verifica se é o mesmo mercado mas participante diferente
                    const sameMarket = pinnacleMarket === normalizeMarketName(pinnacleOdd.mercado);
                    const differentParticipant = pinnacleParticipant !== normalizeParticipant(pinnacleOdd.participante);
                    
                    // Para handicap, a linha deve ser invertida
                    if (pinnacleMarket.includes('handicap')) {
                        const currentLine = parseFloat(pinnacleOdd.linha);
                        const oppositeLine = parseFloat(pinnacleLine);
                        const lineInverted = Math.abs(currentLine) === Math.abs(oppositeLine) && 
                                           Math.sign(currentLine) !== Math.sign(oppositeLine);
                        
                        return sameMarket && differentParticipant && lineInverted;
                    }
                    
                    // Para outros mercados (mais/menos), a linha deve ser a mesma
                    return sameMarket && differentParticipant && pinnacleLine === normalizeLine(pinnacleOdd.linha);
                })?.odd;

                if (pinnacleOppositeOdd) {
                    // Calcula EV usando a odd da Bet365 e as odds da Pinnacle (incluindo overround)
                    const ev = calculateEV(bet365Odd.odd, pinnacleOdd.odd, pinnacleOppositeOdd);
                    const quarterKelly = calculateQuarterKelly(bet365Odd.odd, ev);

                    opportunities.push({
                        tipo: tipo,
                        mercado: bet365Odd.mercado,
                        participante: bet365Odd.participante,
                        linha: bet365Odd.linha,
                        bet365: {
                            odd: bet365Odd.odd,
                            ev: (ev * 100).toFixed(2) + '%',
                            quarterKelly: (quarterKelly * 100).toFixed(2) + '%'
                        },
                        pinnacle: {
                            odd: pinnacleOdd.odd,
                            oppositeOdd: pinnacleOppositeOdd
                        }
                    });
                }
            }
        }

        // Debug: Mostra resultado dos mercados alternativos
        if (alternativasProcessed > 0) {
            console.log(`🔍 DEBUG - Mercados Alternativas: ${alternativasProcessed} processados, ${alternativasWithMatches} com matches`);
        }
    }

    // Compara odds de gols
    compareMarkets(bet365Odds.Gols, pinnacleGame.Gols, 'Gols');
    compareMarkets(bet365Odds.Escanteios, pinnacleGame.Escanteios, 'Escanteios');
    compareMarkets(bet365Odds.Cartões, pinnacleGame.Cartões, 'Cartões');

    if (opportunities.length > 0) {
        console.log('\n🎯 Oportunidades encontradas:');
        opportunities.forEach(opp => {
            console.log(`\n${opp.tipo} - ${opp.mercado} (${opp.linha})`);
            console.log(`Participante: ${opp.participante}`);
            console.log(`Bet365: ${opp.bet365.odd} (EV: ${opp.bet365.ev}, Quarter Kelly: ${opp.bet365.quarterKelly})`);
            console.log(`Pinnacle: ${opp.pinnacle.odd} (Opposite: ${opp.pinnacle.oppositeOdd})`);
        });
    } else {
        console.log('\n❌ Nenhuma oportunidade encontrada');
    }
}

// Função principal para buscar e comparar odds
async function searchAndCompareOdds() {
    try {
        console.log('📦 Arquivo da Bet365 detectado. Processando...');
        
        // Extrai a liga do arquivo raw
        const bet365League = extractLeagueFromRaw();
        if (!bet365League) {
            console.log('❌ Não foi possível extrair a liga da Bet365');
            return;
        }

        // Obtém o ID da liga na Pinnacle
        const pinnacleLeagueId = getPinnacleLeagueId(bet365League);
        if (!pinnacleLeagueId) {
            console.log('❌ Liga não mapeada');
            return;
        }

        // Carrega os dados da Bet365
        const bet365Content = readFileSync('./python/raw_bet365_asian/bet365_organized.json', 'utf8');
        const bet365Odds = JSON.parse(bet365Content);

        // Busca matchups da liga na Pinnacle
        console.log(`🔍 Buscando matchups da liga Pinnacle ID: ${pinnacleLeagueId}`);
        const matchups = await fetchMatchups(pinnacleLeagueId);
        console.log(`📝 Encontrados ${matchups.length} jogos na liga`);

        // Filtra jogos próximos (até 24 horas)
        const filteredMatchups = matchups.filter(m => isWithinTimeWindow(m.startTime, 96));
        console.log(`📅 Filtrados ${filteredMatchups.length} jogos próximos (próximos 96h)`);

        // Extrai o nome do time da Bet365 para filtrar
        const bet365Handicap = bet365Odds.Gols.find(o => o.mercado === 'Handicap Asiático');
        if (!bet365Handicap) {
            console.log('❌ Não foi possível encontrar handicap da Bet365');
            return;
        }

        const bet365Team = normalizeParticipant(bet365Handicap.participante);
        console.log(`🎯 Procurando por time: "${bet365Team}"`);

        // Filtra matchups que podem conter o time da Bet365
        const potentialMatchups = [];
        const debugTeams = new Set(); // Para mostrar times únicos da Pinnacle
        
        for (const matchup of filteredMatchups) {
            if (matchup.isLive) continue;
            
            // Verifica se algum dos times do matchup corresponde ao time da Bet365
            if (matchup.participants) {
                const homeTeam = matchup.participants.find(p => p.alignment === 'home')?.name;
                const awayTeam = matchup.participants.find(p => p.alignment === 'away')?.name;
                
                // Adiciona para debug
                if (homeTeam) debugTeams.add(homeTeam);
                if (awayTeam) debugTeams.add(awayTeam);
                
                const normalizedHome = normalizeTeamNameWithMapping(homeTeam || '');
                const normalizedAway = normalizeTeamNameWithMapping(awayTeam || '');
                
                // Debug específico para Trinidad and Tobago
                if (homeTeam && homeTeam.toLowerCase().includes('saudi')) {
                    console.log(`🔍 DEBUG saudi: "${homeTeam}" -> "${normalizedHome}" vs "${bet365Team}"`);
                }
                if (awayTeam && awayTeam.toLowerCase().includes('saudi')) {
                    console.log(`🔍 DEBUG saudi: "${awayTeam}" -> "${normalizedAway}" vs "${bet365Team}"`);
                }
                
                if (normalizedHome === bet365Team || normalizedAway === bet365Team) {
                    potentialMatchups.push(matchup);
                    console.log(`🎯 Matchup potencial encontrado: ${matchup.id} - ${homeTeam} vs ${awayTeam}`);
                }
            }
        }

        console.log(`🎯 Encontrados ${potentialMatchups.length} matchups potenciais`);
        
        // Debug: Mostra alguns times da Pinnacle para facilitar o mapeamento
        if (potentialMatchups.length === 0) {
            console.log('\n🔍 DEBUG - Todos os times encontrados na Pinnacle:');
            const teamsArray = Array.from(debugTeams).sort();
            teamsArray.forEach((team, index) => {
                const normalized = normalizeTeamNameWithMapping(team);
                const matchStatus = normalized === bet365Team ? '✅ MATCH!' : '❌';
                console.log(`${index + 1}. "${team}" -> "${normalized}" ${matchStatus}`);
            });
            console.log(`\n💡 Dica: Procure por "Inter Miami" ou similar na lista acima`);
            console.log(`💡 Adicione o mapeamento correto no team_mapping.json`);
            console.log(`💡 Exemplo: "intermiamicf": ["${bet365Team}", "nome correto da pinnacle"]`);
        }

        // Processa apenas os matchups potenciais
        const pinnacleOdds = {};
        
        for (const matchup of potentialMatchups) {
            console.log(`🎮 Processando jogo: ${matchup.id} - ${new Date(matchup.startTime).toLocaleString()}`);
            
            // Fetch related and market data
            const [relatedData, marketData] = await Promise.all([
                fetchRelated(matchup.id),
                fetchMarketRelated(matchup.id)
            ]);

            // Process odds
            const classificados = await processOdds(relatedData, marketData);
            pinnacleOdds[matchup.id] = classificados;
        }

        // Encontra jogo correspondente
        const matchingGame = findMatchingGame(bet365Odds, pinnacleOdds);

        // Compara as odds
        compareOdds(bet365Odds, matchingGame?.pinnacleData);

    } catch (error) {
        console.error('❌ Erro no processamento:', error);
    }
}

// Função para calcular EV (Expected Value)
function calculateEV(bet365Odd, pinnacleOdd, pinnacleOppositeOdd) {
    // Calcula as probabilidades implícitas da Pinnacle
    const pinnacleProb = 1 / pinnacleOdd;
    const pinnacleOppositeProb = 1 / pinnacleOppositeOdd;
    
    // Calcula o overround
    const overround = pinnacleProb + pinnacleOppositeProb;
    
    // Calcula as probabilidades justas removendo o overround
    const fairProb = pinnacleProb / overround;
    
    // Calcula o EV usando a odd da Bet365 e a probabilidade justa
    const ev = (bet365Odd * fairProb) - 1;
    return ev;
}

// Função para calcular Quarter Kelly
function calculateQuarterKelly(odd, ev) {
    const b = odd - 1; // profit
    return (ev / b) * 0.25;
}

// Exporta a função para ser usada pelo watcher
export { searchAndCompareOdds };