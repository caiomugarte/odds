import fs from 'fs/promises';
import path from 'path';

const RAW_DIR = './python/raw_pinnacle';
const OUTPUT_FILE = 'pinnacle_classificado.json';

function americanToDecimal(american) {
    return american > 0
        ? (american / 100) + 1
        : (100 / Math.abs(american)) + 1;
}

function getTipoFromMarketType(name) {
    if (!name) return 'desconhecido';
    const nome = name.toLowerCase();
    if (nome.includes('corner')) return 'Escanteios';
    if (nome.includes('booking') || nome.includes('card')) return 'Cartões';
    return 'Gols';
}

async function main() {
    const files = await fs.readdir(RAW_DIR);

    // Pega o último related_* e extrai o ID
    const relatedFiles = files.filter(f => f.startsWith('related_') && f.endsWith('.json'));
    if (relatedFiles.length === 0) {
        console.error('❌ Nenhum arquivo related_*.json encontrado.');
        return;
    }

    const latestRelated = relatedFiles.sort().reverse()[0]; // assume nome em ordem crescente
    const relatedId = latestRelated.replace('related_', '').replace('.json', '');

    const relatedPath = path.join(RAW_DIR, `related_${relatedId}.json`);
    const pinnaclePath = path.join(RAW_DIR, `pinnacle_${relatedId}.json`);

    // Verifica se o arquivo de odds correspondente existe
    try {
        await fs.access(pinnaclePath);
    } catch (err) {
        console.error(`❌ Arquivo de odds não encontrado para o related: ${pinnaclePath}`);
        return;
    }

    const relatedData = JSON.parse(await fs.readFile(relatedPath, 'utf-8'));
    const pinnacleData = JSON.parse(await fs.readFile(pinnaclePath, 'utf-8'));

    // Cria mapa de matchupId → tipo
    const matchupIdToTipo = new Map();
    for (const entry of relatedData) {
        const tipo = getTipoFromMarketType(entry.league?.name || '');
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

        if (['spread', 'total'].includes(market.type)) {
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
