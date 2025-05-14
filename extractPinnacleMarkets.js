// extractPinnacleMarkets.js
import fs from 'fs';
import { JSDOM } from 'jsdom';

export function extractPinnacleMarkets(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const mercados = [];

    const sections = document.querySelectorAll('.SectionStyled-sc-o6nwof-0');

    sections.forEach(section => {
        const mercado = section.querySelector('.title')?.textContent.trim();
        if (!mercado) return;

        const odds = section.querySelectorAll('button.OddStyled-sc-n6vnd1-0');
        odds.forEach(oddBtn => {
            const linha = oddBtn.querySelector('.name')?.textContent.trim();
            const odd = $(button).find('.odd').contents().filter((_, el) => el.type === 'text').text().trim();

            // Participantes não são marcados diretamente em cada odd — precisamos inferir pela posição
            const titleAttr = oddBtn.getAttribute('title')?.trim();

            if (mercado && linha && odd && titleAttr) {
                mercados.push({
                    mercado,
                    participante: titleAttr, // Pode ser "Acima de X", "Menos de X" ou nome do time
                    linha,
                    odd: parseFloat(odd.replace(',', '.'))
                });
            }
        });
    });

    return mercados;
}
