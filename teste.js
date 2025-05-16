// merge.js corrigido com base no original
import fs from 'fs';

const bet365Markets = JSON.parse(fs.readFileSync('bet365.json'));
const pinnacleMarkets = JSON.parse(fs.readFileSync('pinnacle.json'));

function normalize(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s*-\s*/g, ' - ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeParticipante(p) {
    const norm = p.toLowerCase();
    if (norm.includes('acima') || norm.includes('mais')) return 'over';
    if (norm.includes('menos') || norm.includes('under')) return 'under';
    return norm;
}

function participanteOposto(p) {
    const norm = normalizeParticipante(p);
    return norm === 'over' ? 'under' : 'over';
}

const mercadoMap = {
    'handicap - partida': [
        'handicap asiatico',
        'handicap asiatico - mais opcoes'
    ],
    'handicap - 1º tempo': [
        'handicap asiatico - 1º tempo',
        '1º tempo - handicap asiatico - mais alternativas',
        '1º tempo - handicap asiatico - mais opcoes',
        '1º tempo - handicap asiatico',
        '1º tempo handicap asiatico',
        '1º tempo - handicap asiático - mais alternativas'
    ],
    'total - partida': [
        'gols +/ -',
        'gols +/-',
        'gols +/- - mais alternativas',
        'total de gols',
        'total - partida'
    ],
    'total - 1º tempo': [
        '1º tempo gols + ou -',
        '1º tempo - gols +/- - mais alternativas'
    ],
    'handicap (escanteios) - partida': [
        'handicap asiatico - escanteios'
    ],
    'total (escanteios) - partida': [
        'total (escanteios) - partida'
    ],
    'total (escanteios) - 1º tempo': [
        '1º tempo - escanteios asiaticos',
        '1º tempo - escanteios asiáticos',
        '1º tempo escanteios asiaticos',
        '1º tempo escanteios asiáticos',
        '1º tempo - escanteios',
        'escanteios - 1º tempo'
    ]
};

function normalizeMarketName(market) {
    const norm = normalize(market);
    for (const [key, aliases] of Object.entries(mercadoMap)) {
        if (aliases.some(alias => normalize(alias) === norm)) {
            return key;
        }
    }
    return norm; // fallback
}

const comparacoes = [];

for (const a of bet365Markets) {
    for (const b of pinnacleMarkets) {
        const mercadoA = normalizeMarketName(a.mercado);
        const mercadoB = normalizeMarketName(b.mercado);
        const linhaA = normalize(a.linha);
        const linhaB = normalize(b.linha);
        const participanteA = normalizeParticipante(a.participante);
        const participanteB = normalizeParticipante(b.participante);

        if (mercadoA !== mercadoB || linhaA !== linhaB || participanteA !== participanteB) continue;

        if (a.odd > b.odd) {
            const oposto = pinnacleMarkets.find(x =>
                normalizeMarketName(x.mercado) === mercadoB &&
                normalize(x.linha) === linhaB &&
                normalizeParticipante(x.participante) === participanteOposto(b.participante)
            );

            if (!oposto) continue;

            const fairA = 1 / a.odd;
            const fairB = 1 / oposto.odd;
            const overround = fairA + fairB;
            const probA = fairA / overround;
            const EV = (a.odd * probA - 1) * 100;
            const kelly = (a.odd * probA - (1 - probA)) * 100;

            comparacoes.push({
                mercado: a.mercado,
                linha: a.linha,
                participante: a.participante,
                bet365: a.odd,
                pinnacle: b.odd,
                pinnacle_opposite: oposto.odd,
                participante_opposite: oposto.participante,
                linha_opposite: oposto.linha,
                diferenca: a.odd - b.odd,
                overround: overround.toFixed(2),
                probA_fair: probA.toFixed(2),
                probB_fair: (1 - probA).toFixed(2),
                EV: EV.toFixed(2),
                kelly: kelly.toFixed(2),
                quarter_kelly: (kelly / 4).toFixed(2),
                stake: (kelly / 15).toFixed(2)
            });
        }
    }
}

console.log(JSON.stringify(comparacoes, null, 2));
