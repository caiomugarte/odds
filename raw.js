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

    // Helper para determinar o tipo de mercado
    const getMarketType = (marketName) => {
        if (marketName.includes('Mais Alternativas')) return 'alternatives';
        if (marketName.includes('Asiático') || marketName.includes('Gols +/-')) return 'asian';
        return 'normal';
    };

    for (const line of lines) {
        const [tag, ...parts] = line.split(';');

        if (tag === 'MG') {
            currentMarket = (parts.find(p => p.startsWith('NA=')) || '').replace('NA=', '').trim();
            marketType = getMarketType(currentMarket);
            availableLines = [];
        }

        if (tag === 'MA') {
            const nome = (parts.find(p => p.startsWith('NA=')) || '').replace('NA=', '').trim();
            if (nome && (nome === 'Mais de' || nome === 'Menos de' || nome.includes('Corinthians') || nome.includes('Novorizontino'))) {
                currentParticipant = nome;
            }
        }

        if (tag === 'PA') {
            const id = (parts.find(p => p.startsWith('ID=')) || '').replace('ID=', '').trim();

            // Captura linhas disponíveis
            if (id.startsWith('PC')) {
                const lineValue = (parts.find(p => p.startsWith('NA=')) || '').replace('NA=', '').trim();
                if (lineValue) availableLines.push(lineValue);
                continue;
            }

            // Processa odds
            const odd = (parts.find(p => p.startsWith('OD=')) || '').replace('OD=', '').trim();
            if (!odd || !currentParticipant) continue;

            let linha = '';
            if (marketType === 'alternatives') {
                // Para mercados com alternativas, usa as linhas em ordem
                const idx = mercados.filter(m => m.mercado === currentMarket && m.participante === currentParticipant).length;
                linha = availableLines[idx] || 'N/A';
            } else {
                // Para outros mercados
                linha = (parts.find(p => p.startsWith('HA=')) || '').replace('HA=', '').trim();
                if (!linha && availableLines.length > 0) linha = availableLines[0];
            }

            mercados.push({
                mercado: currentMarket,
                participante: currentParticipant,
                linha: linha || 'N/A',
                odd: fractionalToDecimal(odd),
                casa: 'bet365'
            });
        }
    }

    return mercados;
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

function organizeMarkets(mercados) {
    const organized = {};

    // Primeiro agrupa por nome de mercado
    mercados.forEach(m => {
        if (!organized[m.mercado]) organized[m.mercado] = [];
        organized[m.mercado].push(m);
    });

    // Depois remove duplicatas dentro de cada mercado
    Object.keys(organized).forEach(key => {
        const unique = [];
        const seen = new Set();

        organized[key].forEach(m => {
            const marketKey = `${m.participante}|${m.linha}`;
            if (!seen.has(marketKey)) {
                seen.add(marketKey);
                unique.push(m);
            }
        });

        organized[key] = unique;
    });

    return organized;
}

loadAllBet365Markets().then(mercados => {
    console.log('Total mercados Bet365 carregados:', mercados.length);
    console.log(mercados);
});
