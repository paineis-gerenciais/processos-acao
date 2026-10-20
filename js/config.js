// Configuração web do projeto Firebase "processos-acao".
// Estes valores são públicos por natureza (identificam o projeto no navegador; não dão acesso aos dados: quem
// protege os dados são as regras do Firestore). Não colocar aqui segredo, chave de conta de serviço nem endereço
// do emulador: a versão publicada não pode conter "localhost" (parecer de segurança, "Publicação").
export const firebaseConfig = {
  apiKey: 'AIzaSyA84gclF2Hp15GvSY0wHPoktUymhZ-Hzjw',
  authDomain: 'processos-acao.firebaseapp.com',
  projectId: 'processos-acao',
  storageBucket: 'processos-acao.firebasestorage.app',
  messagingSenderId: '199438168906',
  appId: '1:199438168906:web:15a842ab4493cebada47b3',
};

export default firebaseConfig;
