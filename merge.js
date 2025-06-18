import fs from 'fs';
import path from 'path';

const BET365_FILE = './python/raw_bet365_asian/bet365_organized.json';
const PINNACLE_DIR = './classified_pinnacle';

// Carrega o mapeamento de times e ligas
const teamMapping = JSON.parse(fs.readFileSync('./team_mapping.json', 'utf8'));
const leagueMapping = JSON.parse(fs.readFileSync('./league_mapping.json', 'utf8'));

// Função para extrair a liga do arquivo raw da Bet365
function extractLeagueFromRaw() {
    try {
        const rawFiles = fs.readdirSync('./python/raw_bet365_asian')
            .filter(f => f.endsWith('.txt'));
        
        if (rawFiles.length === 0) {
            console.log('❌ Nenhum arquivo raw encontrado');
            return null;
        }
        
        const rawFile = rawFiles[0];
        const content = fs.readFileSync(`./python/raw_bet365_asian/${rawFile}`, 'utf8');
        
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

function normalizeTeamName(name) {
    return name.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace('corners', '')
        .replace('sp', '')
        .trim();
}

// Nova função para normalizar nomes de times usando o mapeamento
function normalizeTeamNameWithMapping(name) {
    const normalizedName = name.toLowerCase().trim();
    
    // Primeiro, tenta encontrar no mapeamento
    for (const [canonicalName, variations] of Object.entries(teamMapping)) {
        if (variations.includes(normalizedName)) {
            return canonicalName;
        }
    }
    
    // Se não encontrar no mapeamento, usa a normalização básica
    return normalizeTeamName(name);
}

function normalizeLine(line) {
    // Converte para número para comparação
    const num = parseFloat(line);
    if (isNaN(num)) return line;
    
    // Arredonda para 1 casa decimal para evitar problemas de precisão
    return num.toFixed(1);
}

function normalizeMarketName(name) {
    const isFirstHalf = name.toLowerCase().includes('1º tempo');
    let normalized = name.toLowerCase()
        // Primeiro remove o 'asiático' e espaços extras
        .replace('asiático', '')
        .replace(/\s+/g, ' ')
        // Mapeamento exato dos mercados
        .replace('gols handicap', 'handicap')
        .replace('gols +/ -', 'mais/menos')
        .replace('total de gols', 'mais/menos')
        .replace('handicap - 1º tempo', '1º tempo handicap')
        .replace('1º tempo gols + ou -', '1º tempo mais/menos')
        .replace('total de escanteios', 'mais/menos')
        .replace('handicap - escanteios', 'handicap')
        .replace('1º tempo - escanteios', '1º tempo mais/menos')
        .replace("1º Tempo - Gols +/- - Alternativas", "1º tempo mais/menos")
        .replace("1º Tempo - Handicap - Alternativas", "1º tempo handicap")
        .replace("Gols ＋/- - Alternativas", "mais/menos")
        .replace("Handicap - Alternativas", 'handicap')
        .trim();

    // Remove qualquer 's' solto no final
    normalized = normalized.replace(/\s+s$/, '');

    return normalized;
}

function isFirstHalfMarket(marketName) {
    return marketName.toLowerCase().includes('1º tempo');
}

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

function findMatchingGame(bet365Odds, pinnacleOdds, pinnacleLeagueId = null) {
    // Pega os times do primeiro handicap da Bet365
    const bet365Handicap = bet365Odds.Gols.find(o => o.mercado === 'Handicap Asiático');
    if (!bet365Handicap) return null;

    // Normaliza o nome do time da Bet365
    const bet365Team = normalizeParticipant(bet365Handicap.participante);
    console.log(`🔍 Procurando jogo da Bet365: "${bet365Handicap.participante}" -> "${bet365Team}"`);

    // Se temos o ID da liga da Pinnacle, filtra os jogos por liga
    let pinnacleGames = Object.entries(pinnacleOdds);
    
    if (pinnacleLeagueId) {
        console.log(`🎯 Filtrando jogos da liga Pinnacle ID: ${pinnacleLeagueId}`);
        // Aqui você pode implementar a lógica para filtrar por liga
        // Por enquanto, vamos procurar em todos os jogos
    }

    // Procura nos arquivos do Pinnacle
    for (const [matchupId, pinnacleData] of pinnacleGames) {
        const pinnacleHandicap = pinnacleData.Gols.find(o => o.mercado === 'Handicap');
        if (!pinnacleHandicap) continue;

        // Normaliza o nome do time do Pinnacle
        const pinnacleTeam = normalizeParticipant(pinnacleHandicap.participante);
        console.log(`  📍 Pinnacle ${matchupId}: "${pinnacleHandicap.participante}" -> "${pinnacleTeam}"`);

        // Compara os times normalizados
        if (pinnacleTeam === bet365Team) {
            console.log(`✅ Jogo encontrado! MatchupId: ${matchupId}`);
            return matchupId;
        }
    }

    console.log(`❌ Nenhum jogo correspondente encontrado para "${bet365Team}"`);
    return null;
}

function isSameMarketType(bet365Market, pinnacleMarket) {
    // Remove espaços extras e converte para minúsculo para comparação
    const b365 = bet365Market.toLowerCase().replace(/\s+/g, ' ').trim();
    const pin = pinnacleMarket.toLowerCase().replace(/\s+/g, ' ').trim();
    
    return b365 === pin;
}

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

function calculateQuarterKelly(odd, ev) {
    const b = odd - 1; // profit
    return (ev / b) * 0.25;
}

function compareOdds(bet365Odds, pinnacleOdds, pinnacleLeagueId = null) {
    const matchingGameId = findMatchingGame(bet365Odds, pinnacleOdds, pinnacleLeagueId);
    if (!matchingGameId) {
        console.log('❌ Nenhum jogo correspondente encontrado');
        return;
    }

    const pinnacleGame = pinnacleOdds[matchingGameId];
    if (!pinnacleGame) {
        console.log('❌ Dados do Pinnacle não encontrados para o jogo correspondente');
        return;
    }

    const opportunities = [];

    // Função auxiliar para comparar mercados do mesmo tipo
    function compareMarkets(bet365Markets, pinnacleMarkets, tipo) {
        // Verifica se os arrays existem
        if (!Array.isArray(bet365Markets) || !Array.isArray(pinnacleMarkets)) {
            console.log(`❌ Dados inválidos para ${tipo}`);
            console.log('Bet365:', bet365Markets);
            console.log('Pinnacle:', pinnacleMarkets);
            return;
        }

        for (const bet365Odd of bet365Markets) {
            const isBet365FirstHalf = isFirstHalfMarket(bet365Odd.mercado);
            
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
                
                return bet365Market === pinnacleMarket && 
                       bet365Participant === pinnacleParticipant && 
                       pinnacleLine === bet365Line;
            });

            if (pinnacleOdd) {
                // Só considera oportunidade se a odd da Bet365 for maior que a da Pinnacle
                if (bet365Odd.odd > pinnacleOdd.odd) {
                    // Encontra a odd contrária na Pinnacle
                    const pinnacleOppositeOdd = pinnacleMarkets.find(p => {
                        const isPinnacleFirstHalf = isFirstHalfMarket(p.mercado);
                        if (isPinnacleFirstHalf !== isFirstHalfMarket(pinnacleOdd.mercado)) return false;
                        
                        const pinnacleMarket = normalizeMarketName(p.mercado);
                        const pinnacleParticipant = normalizeParticipant(p.participante);
                        const pinnacleLine = normalizeLine(p.linha);
                        
                        return pinnacleMarket === normalizeMarketName(pinnacleOdd.mercado) &&
                               pinnacleParticipant !== normalizeParticipant(pinnacleOdd.participante) &&
                               pinnacleLine === pinnacleLine;
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
        }
    }

    // Compara odds de gols
    compareMarkets(bet365Odds.Gols, pinnacleGame.Gols, 'Gols');

    // Compara odds de escanteios
    compareMarkets(bet365Odds.Escanteios, pinnacleGame.Escanteios, 'Escanteios');

    // Compara odds de cartões
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

async function main() {
    try {
        // Extrai a liga do arquivo raw da Bet365
        const bet365League = extractLeagueFromRaw();
        if (!bet365League) {
            console.log('❌ Não foi possível extrair a liga da Bet365');
            return;
        }

        // Obtém o ID da liga na Pinnacle
        const pinnacleLeagueId = getPinnacleLeagueId(bet365League);
        if (!pinnacleLeagueId) {
            console.log('❌ Liga não mapeada, continuando sem filtro de liga...');
        }

        // Carrega odds da Bet365
        const bet365Content = fs.readFileSync(BET365_FILE, 'utf8');
        const bet365Odds = JSON.parse(bet365Content);

        // Debug: Mostra a estrutura dos dados da Bet365
        console.log('📊 Estrutura dos dados da Bet365:', JSON.stringify(bet365Odds, null, 2));

        // Carrega todos os arquivos do Pinnacle
        const pinnacleFiles = fs.readdirSync(PINNACLE_DIR)
            .filter(f => f.startsWith('pinnacle_classificado_') && f.endsWith('.json'));

        const pinnacleOdds = {};
        for (const file of pinnacleFiles) {
            const content = fs.readFileSync(path.join(PINNACLE_DIR, file), 'utf8');
            const matchupId = file.replace('pinnacle_classificado_', '').replace('.json', '');
            pinnacleOdds[matchupId] = JSON.parse(content);
        }

        // Compara as odds usando o ID da liga se disponível
        compareOdds(bet365Odds, pinnacleOdds, pinnacleLeagueId);

        // Limpa os arquivos da pasta raw_bet365_asian
        const rawDir = './python/raw_bet365_asian';
        const files = fs.readdirSync(rawDir);
        for (const file of files) {
            fs.unlinkSync(path.join(rawDir, file));
        }
        console.log('\n🧹 Arquivos da pasta raw_bet365_asian foram limpos');

    } catch (error) {
        console.error('❌ Erro:', error);
        // Mostra mais detalhes do erro
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }
}

main();