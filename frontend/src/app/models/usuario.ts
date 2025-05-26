export interface Usuario {
    id: number;
    nombre: string;
    apellido: string;
    correo: string;
    rol: 'cliente' | 'administrador';
    fecha_registro?: string;
  }
  