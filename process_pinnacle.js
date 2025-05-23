import fs from 'fs/promises';
import path from 'path';

const RAW_DIR = './python/raw_pinnacle'; // ajuste se necessário
const RELATED_FILE = 'related_1609952337.json';
const PINNACLE_FILE = 'pinnacle_1609952337.json';
const OUTPUT_FILE = 'pinnacle_classificado.json';

function americanToDecimal(american) {
    return american > 0
        ? (american / 100) + 1
        : (100 / Math.abs(american)) + 1;
}

function getTipoFromMarketType(type) {
    if (!type) return 'desconhecido';
    if (type.includes('corner')) return 'Escanteios';
    if (type.includes('booking') || type.includes('card')) return 'Cartões';
    return 'Gols';
}

async function main() {
    const relatedPath = path.join(RAW_DIR, RELATED_FILE);
    const pinnaclePath = path.join(RAW_DIR, PINNACLE_FILE);

    const relatedData = JSON.parse(await fs.readFile(relatedPath, 'utf-8'));
    const pinnacleData = JSON.parse(await fs.readFile(pinnaclePath, 'utf-8'));

    // Cria mapa de matchupId → tipo
    const matchupIdToTipo = new Map();
    for (const entry of relatedData) {
        const tipo = getTipoFromMarketType(entry.league?.name?.toLowerCase() || '');
        matchupIdToTipo.set(entry.id, tipo);
    }

    // Processa os mercados
    const classificados = {
        Gols: [],
        Escanteios: [],
        Cartões: [],
        desconhecido: []
    };

    for (const market of pinnacleData) {
        const tipo = matchupIdToTipo.get(market.matchupId) || 'desconhecido';
        const periodo = market.period === 1 ? '1º Tempo ' : '';

        if (market.type === 'spread' || market.type === 'total') {
            for (const price of market.prices) {
                classificados[tipo].push({
                    mercado: `${periodo}${market.type === 'spread' ? 'Handicap' : 'Mais/Menos'}`,
                    participante: price.designation,
                    linha: price.points?.toString() ?? '-',
                    odd: americanToDecimal(price.price),
                    matchupId: market.matchupId
                });
            }
        }
    }

    const outPath = path.join(RAW_DIR, OUTPUT_FILE);
    await fs.writeFile(outPath, JSON.stringify(classificados, null, 2));
    console.log(`✅ Mercados classificados salvos em: ${outPath}`);
}

main();
