import { FC } from "react";

const App: FC = () => {
  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>👑 Jarvis MCLL</h1>
      <p>Dashboard de Acompanhamento de Operações</p>
      <p>Versão: 1.0.0</p>
      <hr />
      <h2>Status do Sistema</h2>
      <ul>
        <li>✅ Frontend carregado com sucesso</li>
        <li>⏳ Backend aguardando configuração</li>
        <li>📊 Dashboard pronto para desenvolvimento</li>
      </ul>
    </div>
  );
};

export default App;
