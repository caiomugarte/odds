import fs from 'fs';
import path from 'path';

const BANCA = 265;
const betData = JSON.parse(fs.readFileSync('./python/raw_bet365_asian/bet365_organized.json', 'utf8'));
const pinData = JSON.parse(fs.readFileSync('./python/raw_pinnacle/pinnacle_classificado.json', 'utf8'));

// Carrega o related.json mais recente para pegar os nomes dos times
const relatedFiles = fs.readdirSync('./python/raw_pinnacle').filter(f => f.startsWith('related_') && f.endsWith('.json'));
const latestRelated = relatedFiles.sort().reverse()[0];
const relatedData = JSON.parse(fs.readFileSync(`./python/raw_pinnacle/${latestRelated}`, 'utf8'));

// Cria um map matchupId+alignment -> teamName
const teamNameMap = new Map();
for (const match of relatedData) {
    for (const p of match.participants) {
        teamNameMap.set(`${match.id}|${p.alignment}`, p.name);
    }
}

const mercadoMap = {
    "Gols +/ -": "Mais/Menos",
    "Gols +/- - Mais Alternativas": "Mais/Menos",
    "1º Tempo Gols + ou -": "1º Tempo Mais/Menos",
    "1º Tempo - Gols +/- - Mais Alternativas": "1º Tempo Mais/Menos",
    "Handicap Asiático": "Handicap",
    "Handicap Asiático - Mais Opções": "Handicap",
    "1º Tempo - Handicap Asiático - Mais Alternativas": "1º Tempo Handicap",
    "Handicap Asiático - 1º Tempo": "1º Tempo Handicap",
    "Total de Escanteios Asiáticos": "Mais/Menos",
    "Handicap Asiático - Escanteios": "Handicap",
    "Total de Cartões Asiáticos": "Mais/Menos",
    "Handicap Asiático - Cartões": "Handicap"
};

const participanteMap = {
    "over": "mais de",
    "under": "menos de",
    "mais de": "mais de",
    "menos de": "menos de",
    "home": "home",
    "away": "away"
};

function normalizeLinha(linha) {
    return linha?.replace(/\s+/g, '').replace(/,/g, ' / ');
}

function decimal(odd) {
    return parseFloat(odd);
}

function calcFairProb(oddA, oddB) {
    const pA = 1 / oddA;
    const pB = 1 / oddB;
    return pA / (pA + pB);
}

function calcEVComFair(odd_bet, odd_pin, odd_contraria) {
    const fair_prob = calcFairProb(odd_pin, odd_contraria);
    return ((odd_bet * fair_prob) - 1)*100;
}

function calcKelly(odd_bet, odd_pin, odd_contraria) {
    const fair_prob = calcFairProb(odd_pin, odd_contraria);
    const b = odd_bet - 1;
    const kelly = (odd_bet * fair_prob - 1) / b;
    return kelly > 0 ? kelly*100 : 0;
}

function flatten(data, casa) {
    const mercados = [];
    for (const tipo in data) {
        for (const m of data[tipo]) {
            const mercadoPad = mercadoMap[m.mercado?.trim()] || m.mercado?.trim();
            mercados.push({
                tipo,
                mercado: mercadoPad,
                participante: m.participante?.trim().toLowerCase(),
                linha: normalizeLinha(m.linha),
                odd: decimal(m.odd),
                casa,
                matchupId: m.matchupId // importante para mapear o time
            });
        }
    }
    return mercados;
}

function getLinhaContraria(market, linha) {
    if (market.mercado.includes('Handicap')) {
        const valor = parseFloat(linha);
        if (!isNaN(valor)) return (-valor).toString();
    }
    return linha;
}

const betMarkets = flatten(betData, 'bet365');
const pinMarkets = flatten(pinData, 'pinnacle');

const oportunidades = [];

for (const bet of betMarkets) {
    for (const pin of pinMarkets) {
        const participanteBet = participanteMap[bet.participante] || bet.participante;
        const participantePin = participanteMap[pin.participante] || pin.participante;

        const match = (
            bet.tipo === pin.tipo &&
            bet.mercado === pin.mercado &&
            participanteBet === participantePin &&
            bet.linha === pin.linha
        );

        if (match && bet.odd > pin.odd) {
            const lado_oposto = pinMarkets.find(p =>
                p.tipo === pin.tipo &&
                p.mercado === pin.mercado &&
                p.linha === getLinhaContraria(pin, pin.linha) &&
                p.participante !== pin.participante
            );

            if (lado_oposto) {
                const ev = calcEVComFair(bet.odd, pin.odd, lado_oposto.odd);
                const kelly = calcKelly(bet.odd, pin.odd, lado_oposto.odd);
                const quarterKelly = (kelly/4);
                const rounderQuarterKelly = Math.round(quarterKelly / 0.25) * 0.25;
                const stake = (rounderQuarterKelly*(BANCA/100)).toFixed(2);
                const teamName = teamNameMap.get(`${pin.matchupId}|${bet.participante}`) || bet.participante;
                const descricao = `${teamName} ${bet.linha}`;
                if(ev > 3){
                    oportunidades.push({
                        tipo: bet.tipo,
                        mercado: bet.mercado,
                        participante: bet.participante,
                        linha: bet.linha,
                        odd_bet365: bet.odd,
                        odd_pinnacle: pin.odd,
                        odd_contraria: lado_oposto.odd,
                        ev: ev.toFixed(3),
                        kelly: kelly.toFixed(3),
                        quarterKelly: rounderQuarterKelly.toFixed(2),
                        stake: stake,
                        descricao: descricao
                    });
                }
            }
        }
    }
}

function limparTudo(diretorio) {
    const fullPath = path.resolve(diretorio);
    fs.readdirSync(fullPath).forEach(file => {
        const filePath = path.join(fullPath, file);
        fs.unlinkSync(filePath);
        console.log(`🧹 Apagado: ${filePath}`);
    });
}

// Ordena por EV decrescente
oportunidades.sort((a, b) => parseFloat(a.ev) - parseFloat(b.ev));

// Salva como JSON
fs.writeFileSync('./oportunidades.json', JSON.stringify(oportunidades, null, 2), 'utf8');
const diaHoje = new Date().getDate();
// Também exibe no console
console.log("📊 Oportunidades com EV corrigido:");
if (oportunidades.length === 0) {
    console.log("Nenhuma oportunidade com EV positivo.");
} else {
    oportunidades.forEach((o, i) => {
        console.log(`#${i + 1}`);
        console.log(`Tipo: ${o.tipo} | Mercado: ${o.mercado} | Linha: ${o.linha}`);
        console.log(`Participante: ${o.participante}`);
        console.log(`Bet365: ${o.odd_bet365} | Pinnacle: ${o.odd_pinnacle} | Contrária: ${o.odd_contraria}`);
        console.log(`EV: ${o.ev} | Kelly: ${o.kelly} | QuarterKelly: ${o.quarterKelly} | Stake: ${o.stake}`);
        console.log(`\n`);
    });

    console.log("\n📋 Copie e cole para a planilha:");
    oportunidades.forEach(o => {
        console.log(`${diaHoje};Eu;Bet365;SIMPLES;${o.descricao};PRÉ LIVE;Futebol ⚽️;${o.odd_bet365.toFixed(2).replace('.', ',')};${o.quarterKelly.replace('.', ',')}`);
    });

    console.log(`\n✅ Também salvo em: oportunidades.json`);
}

// Limpa os diretórios
limparTudo('./python/raw_bet365_asian');
limparTudo('./python/raw_pinnacle');
