import React from 'react';
import CompactDialog from './CompactDialog';
import Cosmetics from './Cosmetics';
import './inventory.css';
export default function InventoryDialog({me,onClose,onEquipped}){return <CompactDialog title="Meu baú" closeLabel="Fechar Meu baú" size="large" onClose={onClose}><Cosmetics me={me} onEquipped={onEquipped}/></CompactDialog>;}
