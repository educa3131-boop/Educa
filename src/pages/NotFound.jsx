import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
export default function NotFound() {
  return <div className="container" style={{ padding: '80px 0' }}><div className="empty"><div className="icon-wrap"><Compass size={24} /></div><h1 style={{ fontSize: '2rem' }}>Página não encontrada</h1><p>O link que procuras não existe ou foi movido. Volta ao início para continuar a explorar a EDUCA.</p><Link to="/" className="btn btn-primary">Voltar ao início</Link></div></div>;
}
