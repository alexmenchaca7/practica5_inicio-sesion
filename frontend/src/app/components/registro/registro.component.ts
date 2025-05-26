import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router'; // RouterModule para routerLink en la plantilla
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService, AuthResponseSimple } from '../../services/auth.service'; // Ajusta la ruta si es necesario
import { HeaderComponent } from '../header/header.component'; // Si lo usas

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    RouterModule, // Para routerLink
    // HeaderComponent // Solo si usas <app-header> dentro de la plantilla de registro
  ],
  templateUrl: './registro.component.html', // Asegúrate que el path sea correcto
  styleUrls: ['./registro.component.css']   // Asegúrate que el path sea correcto
})
export class RegistroComponent {
  datosUsuario = {
    nombre: '',
    apellido: '',
    correo: '',
    contrasena: '',
    // rol: 'cliente' // El rol se asigna por defecto en el backend en la versión simplificada
  };
  errorMessage: string | null = null;
  successMessage: string | null = null;
  isLoading: boolean = false;

  constructor(private authService: AuthService, private router: Router) {}

  onSubmit(): void {
    this.errorMessage = null;
    this.successMessage = null;
    this.isLoading = true;

    if (!this.datosUsuario.nombre?.trim() || 
        !this.datosUsuario.apellido?.trim() || 
        !this.datosUsuario.correo?.trim() || 
        !this.datosUsuario.contrasena) {
      this.errorMessage = "Todos los campos son requeridos.";
      this.isLoading = false;
      return;
    }
    if (this.datosUsuario.contrasena.length < 6) {
        this.errorMessage = "La contraseña debe tener al menos 6 caracteres.";
        this.isLoading = false;
        return;
    }
    // Podrías añadir una validación de formato de email aquí también en el frontend

    this.authService.registro(this.datosUsuario).subscribe({
      next: (response: AuthResponseSimple) => {
        this.isLoading = false;
        this.successMessage = response.message + " Ahora puedes iniciar sesión.";
        console.log('Registro exitoso:', response);
        // Opcional: Resetear el formulario
        // this.datosUsuario = { nombre: '', apellido: '', correo: '', contrasena: '' };
        // Opcional: Redirigir a login después de un delay
        setTimeout(() => {
          if (!this.errorMessage) { // Solo redirigir si no hubo error posterior
            this.router.navigate(['/login']);
          }
        }, 2500);
      },
      error: (err) => {
        this.isLoading = false;
        console.error('Error en registro:', err);
        this.errorMessage = err.message || 'Ocurrió un error durante el registro.';
      }
    });
  }
}