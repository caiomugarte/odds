import fs from 'fs';
const BANCA = 265;
const betData = JSON.parse(fs.readFileSync('./python/raw_bet365_asian/bet365_organized.json', 'utf8'));
const pinData = JSON.parse(fs.readFileSync('./python/raw_pinnacle/pinnacle_classificado.json', 'utf8'));

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
    "Mais de": "over",
    "Menos de": "under",
    "Real Madrid": "home",
    "Barcelona": "away",
    "Grêmio": "home",
    "Bahia": "away"
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
            const participantePad = participanteMap[m.participante?.trim()] || m.participante?.trim().toLowerCase();
            mercados.push({
                tipo,
                mercado: mercadoPad,
                participante: participantePad,
                linha: normalizeLinha(m.linha),
                odd: decimal(m.odd),
                casa
            });
        }
    }
    return mercados;
}

const betMarkets = flatten(betData, 'bet365');
const pinMarkets = flatten(pinData, 'pinnacle');

const oportunidades = [];

for (const bet of betMarkets) {
    for (const pin of pinMarkets) {
        const match = (
            bet.tipo === pin.tipo &&
            bet.mercado === pin.mercado &&
            bet.participante === pin.participante &&
            bet.linha === pin.linha
        );

        if (match && bet.odd > pin.odd) {
            const lado_oposto = pinMarkets.find(p =>
                p.tipo === pin.tipo &&
                p.mercado === pin.mercado &&
                p.linha === pin.linha &&
                p.participante !== pin.participante
            );

            if (lado_oposto) {
                const ev = calcEVComFair(bet.odd, pin.odd, lado_oposto.odd);
                const kelly = calcKelly(bet.odd, pin.odd, lado_oposto.odd);
                const octKelly = (kelly/8);
                const stake = (octKelly*(BANCA/100)).toFixed(2)
                if (ev > 0) {
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
                        octKelly: octKelly.toFixed(2),
                        stake: stake
                    });
                }
            }
        }
    }
}

// Ordena por EV decrescente
oportunidades.sort((a, b) => parseFloat(b.ev) - parseFloat(a.ev));

// Salva como JSON
fs.writeFileSync('./oportunidades_ev_corrigido.json', JSON.stringify(oportunidades, null, 2), 'utf8');

// Também exibe no console
console.log("📊 Oportunidades com EV corrigido:");
if (oportunidades.length === 0) {
    console.log("Nenhuma oportunidade com EV positivo.");
} else {
    oportunidades.forEach((o, i) => {
        console.log(`\n🔹 #${i + 1}`);
        console.log(`Tipo: ${o.tipo} | Mercado: ${o.mercado} | Linha: ${o.linha}`);
        console.log(`Participante: ${o.participante}`);
        console.log(`Bet365: ${o.odd_bet365} | Pinnacle: ${o.odd_pinnacle} | Contrária: ${o.odd_contraria}`);
        console.log(`EV: ${o.ev} | Kelly: ${o.kelly}`);
    });
    console.log(`\n✅ Também salvo em: oportunidades_ev_corrigido.json`);
}
