// extractAsianMarkets.js
import fs from 'fs';
import { JSDOM } from 'jsdom';

function extractMarketsFromHTML(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const mercados = [];

    const pods = document.querySelectorAll('.gl-MarketGroupPod');
    console.log('Total de grupos encontrados:', pods.length);

    pods.forEach((pod, idx) => {
        const titulo = pod.querySelector('.cm-MarketGroupWithIconsButton_Text')?.textContent.trim();
        console.log(`Grupo ${idx + 1}:`, titulo);
        if (!titulo) return;

        const wrapper = pod.querySelector('.gl-MarketGroup_Wrapper');
        if (!wrapper) return;

        const blocos = wrapper.querySelectorAll('.gl-Market') || [];
        console.log(`  Blocos encontrados: ${blocos.length}`);

        if (/Handicap Asiático/i.test(titulo)) {
            try {
                const headers = wrapper.querySelectorAll('.gl-MarketColumnHeader');
                const colunas = Array.from(blocos);

                colunas.forEach((col, i) => {
                    const participante = headers[i]?.textContent.trim();
                    const opcoes = col.querySelectorAll('.gl-ParticipantCentered');

                    opcoes.forEach(opcao => {
                        const linha = opcao.querySelector('.gl-ParticipantCentered_Handicap')?.textContent.trim();
                        const odd = opcao.querySelector('.gl-ParticipantCentered_Odds')?.textContent.trim();

                        if (linha && odd) {
                            mercados.push({
                                mercado: titulo,
                                participante,
                                linha,
                                odd: parseFloat(odd.replace(',', '.'))
                            });
                        }
                    });
                });
            } catch (err) {
                console.error('Erro ao processar Handicap Asiático:', err);
            }
            return;
        }

        const participantes = wrapper.querySelectorAll('.gl-Participant');
        participantes.forEach(part => {
            const nome = part.querySelector('.srb-ParticipantLabelCentered_Name')?.textContent.trim() ||
                part.querySelector('.gl-Participant_Name')?.textContent.trim();
            const odd = part.querySelector('.gl-ParticipantOddsOnly_Odds')?.textContent.trim();

            if (!nome || !odd) return;

            const tipo = nome.toLowerCase().includes('mais') ? 'Mais de'
                : nome.toLowerCase().includes('menos') ? 'Menos de'
                    : null;
            const linha = nome.match(/[-+]?\d+(\.\d+)?/g)?.[0];

            if (tipo && linha) {
                const existente = mercados.find(m => m.mercado === titulo && m.linha === linha);
                if (existente) {
                    existente.odds.push({ tipo, odd: parseFloat(odd.replace(',', '.')) });
                } else {
                    mercados.push({
                        mercado: titulo,
                        linha,
                        odds: [{ tipo, odd: parseFloat(odd.replace(',', '.')) }]
                    });
                }
            }
        });
    });

    return mercados;
}

const html = fs.readFileSync('bet365.html', 'utf-8');
const mercados = extractMarketsFromHTML(html);
console.log('RESULTADO FINAL:\n', JSON.stringify(mercados, null, 2));
