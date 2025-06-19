import chokidar from 'chokidar';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

const paths = {
    bet365: './python/raw_bet365_asian'
};

// Função principal para processar quando o arquivo da Bet365 for criado
async function processBet365File() {
    try {
        console.log('📦 Arquivo da Bet365 detectado. Processando...');
        
        // Primeiro processa o arquivo txt da Bet365
        exec('node rawBet365.js', async (err) => {
            if (err) {
                console.error('Erro no processamento Bet365:', err.message);
                return;
            }
            console.log('✅ Bet365 processado');

            // Verifica se o arquivo organized.json foi criado
            if (!fs.existsSync(path.join(paths.bet365, 'bet365_organized.json'))) {
                console.error('❌ Arquivo bet365_organized.json não foi criado');
                return;
            }

            // Agora chama o monitor.js para buscar e comparar odds
            const { searchAndCompareOdds } = await import('./monitor.js');
            await searchAndCompareOdds();

            // Limpa os arquivos
            const files = fs.readdirSync(paths.bet365);
            for (const file of files) {
                fs.unlinkSync(path.join(paths.bet365, file));
            }
            console.log('\n🧹 Arquivos da pasta raw_bet365_asian foram limpos');

        });

    } catch (error) {
        console.error('❌ Erro no processamento:', error);
    }
}

let rodando = false;

console.log('👀 Aguardando arquivo da Bet365...');
chokidar.watch([paths.bet365], { ignoreInitial: true }).on('add', (filePath) => {
    // Só processa se for o arquivo txt da Bet365
    if (!filePath.endsWith('.txt')) return;
    
    // Aguarda 5 segundos antes de processar (tempo para expandir mercados)
    setTimeout(() => {
        if (!rodando) {
            rodando = true;
            processBet365File().finally(() => {
                rodando = false;
            });
        }
    }, 6000); // 5 segundos de delay
});
