import fs from 'fs';
import path from 'path';

function fractionalToDecimal(odd) {
    if (!odd || !odd.includes('/')) return parseFloat(odd);
    const [num, den] = odd.split('/').map(Number);
    return ((num / den) + 1);
}

function parseBet365Raw(content) {
    const lines = content.split('|');
    const mercados = [];
    let currentMarket = null;
    let availableLines = [];
    let currentParticipant = null;
    let marketType = 'normal'; // 'normal', 'asian', 'alternatives'

    let homeAwayMap = new Map();
    const firstLine = lines.find(line => line.startsWith('EV;') && line.includes('EX='));
    if (firstLine) {
        const exMatch = firstLine.match(/EX=([^;]+)/);
        if (exMatch) {
            const exValue = exMatch[1];
            const [homeTeam, awayTeam] = exValue.split(' v ');
            if (homeTeam && awayTeam) {
                homeAwayMap.set(homeTeam.trim().toLowerCase(), 'home');
                homeAwayMap.set(awayTeam.trim().toLowerCase(), 'away');
            }
        }
    }
    const getMarketType = (marketName) => {
        if (marketName.includes('Alternativas')) return 'alternatives';
        if (marketName.includes('Asiático') || marketName.includes('Gols +/-')) return 'asian';
        return 'normal';
    };

    // Crie um contador separado para cada (currentMarket + currentParticipant)
    const participantCounters = new Map();

    for (const line of lines) {
        const [tag, ...parts] = line.split(';');

        if (tag === 'MG') {
            currentMarket = (parts.find(p => p.startsWith('NA=')) || '').replace('NA=', '').trim();
            marketType = getMarketType(currentMarket);
            availableLines = [];
        }

        if (tag === 'MA') {
            const nome = (parts.find(p => p.startsWith('NA=')) || '').replace('NA=', '').trim();
            if (nome) {
                currentParticipant = nome;
            }
        }

        if (tag === 'PA') {
            const id = (parts.find(p => p.startsWith('ID=')) || '').replace('ID=', '').trim();

            if (id.startsWith('PC')) {
                const lineValue = (parts.find(p => p.startsWith('NA=')) || '').replace('NA=', '').trim();
                if (lineValue) availableLines.push(lineValue);
                continue;
            }

            const odd = (parts.find(p => p.startsWith('OD=')) || '').replace('OD=', '').trim();
            if (!odd || !currentParticipant) continue;

            let linha = '';
            if (marketType === 'alternatives' && !currentMarket.includes('Handicap')) {
                // Para mercados alternativos, cada odd corresponde a uma linha específica
                // Vamos usar a posição da odd para determinar a linha
                const key = `${currentMarket}|${currentParticipant}`;
                const count = participantCounters.get(key) || 0;

                if (count < availableLines.length) {
                    linha = availableLines[count];
                    participantCounters.set(key, count + 1);
                } else {
                    // Se já usamos todas as linhas disponíveis, pula
                    continue;
                }
            } else {
                linha = (parts.find(p => p.startsWith('HD=')) || '').replace('HD=', '').trim();
                if (!linha) linha = (parts.find(p => p.startsWith('HA=')) || '').replace('HA=', '').trim();
                if (!linha && availableLines.length > 0) linha = availableLines[0];
            }

            if (!linha) continue;

            const participantePad = currentParticipant.toLowerCase();

            mercados.push({
                mercado: currentMarket,
                participante: participantePad,
                linha: (parseLinha(linha)).toString(),
                odd: fractionalToDecimal(odd),
                casa: 'bet365'
            });
        }
    }


    return mercados;
}

function parseLinha(linha) {
    if (!linha) return null;
    const partes = linha.split(',').map(l => parseFloat(l.trim()));
    if (partes.length === 1) return partes[0]; // linha simples
    // Para linhas asiáticas (duas partes), pode ser média ou comparar cada uma separadamente
    return (partes[0] + partes[1]) / 2; // aqui calculamos a média
}


const rawDir = './python/raw_bet365_asian';

async function loadAllBet365Markets() {
    const files = await fs.promises.readdir(rawDir);
    let allMarkets = [];

    for (const file of files) {
        if (!file.endsWith('.txt')) continue;
        const content = await fs.promises.readFile(path.join(rawDir, file), 'utf-8');
        allMarkets = allMarkets.concat(parseBet365Raw(content));
    }

    const organized = organizeMarkets(allMarkets);

    await fs.promises.writeFile(
        path.join(rawDir, 'bet365_organized.json'),
        JSON.stringify(organized, null, 2)
    );

    return organized;
}

function getTipoMercado(mercadoNome) {
    const nome = mercadoNome.toLowerCase();
    if (nome.includes('escanteio')) return 'Escanteios';
    if (nome.includes('cartões')) return 'Cartões';
    return 'Gols';
}

function organizeMarkets(mercados) {
    const organized = {};

    // Agrupa por tipo (Gols, Escanteios, Cartões)
    mercados.forEach(m => {
        const tipo = getTipoMercado(m.mercado);
        if (!organized[tipo]) organized[tipo] = [];
        organized[tipo].push(m);
    });

    // Remove duplicatas por participante + linha
    for (const tipo in organized) {
        const unique = [];
        const seen = new Set();

        organized[tipo].forEach(m => {
            const key = `${m.mercado}|${m.participante}|${m.linha}|${m.odd}`; // Agora considera também mercado e odd
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(m);
            }
        });

        organized[tipo] = unique;
    }

    return organized;
}


loadAllBet365Markets().then(mercados => {
    console.log('Total mercados Bet365 carregados:', mercados.length);
    console.log(mercados);
});
