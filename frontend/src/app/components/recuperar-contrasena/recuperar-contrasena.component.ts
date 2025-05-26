// src/app/components/recuperar-contrasena/recuperar-contrasena.component.ts
import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router'; // RouterModule para routerLink
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // Para ngModel
import { AuthService, AuthResponseSimple } from '../../services/auth.service'; // Ajusta la ruta

@Component({
  selector: 'app-recuperar-contrasena',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule, // Añadir FormsModule
    RouterModule
  ],
  templateUrl: './recuperar-contrasena.component.html',
  styleUrls: ['./recuperar-contrasena.component.css'] // Opcional
})
export class RecuperarContrasenaComponent {
  datos = {
    correo: '',
    nuevaContrasena: '',
    confirmarNuevaContrasena: ''
  };
  errorMessage: string | null = null;
  successMessage: string | null = null;
  isLoading: boolean = false;

  constructor(private authService: AuthService, private router: Router) {}

  onSubmit(): void {
    this.errorMessage = null;
    this.successMessage = null;
    this.isLoading = true;

    if (!this.datos.correo?.trim() || !this.datos.nuevaContrasena || !this.datos.confirmarNuevaContrasena) {
      this.errorMessage = 'Todos los campos son requeridos.';
      this.isLoading = false;
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.datos.correo)) {
        this.errorMessage = 'Formato de correo inválido.';
        this.isLoading = false;
        return;
    }
    if (this.datos.nuevaContrasena.length < 6) {
      this.errorMessage = 'La nueva contraseña debe tener al menos 6 caracteres.';
      this.isLoading = false;
      return;
    }
    if (this.datos.nuevaContrasena !== this.datos.confirmarNuevaContrasena) {
      this.errorMessage = 'Las contraseñas no coinciden.';
      this.isLoading = false;
      return;
    }

    this.authService.recuperarContrasenaSimple({ correo: this.datos.correo, nuevaContrasena: this.datos.nuevaContrasena })
      .subscribe({
        next: (response: AuthResponseSimple) => {
          this.isLoading = false;
          this.successMessage = response.message;
          // Limpiar formulario y redirigir o mostrar mensaje para ir a login
          this.datos = { correo: '', nuevaContrasena: '', confirmarNuevaContrasena: '' };
          setTimeout(() => {
            if (this.successMessage) { // Solo si fue exitoso
                this.router.navigate(['/login']);
            }
          }, 3000); // Esperar 3 segundos antes de redirigir
        },
        error: (err) => {
          this.isLoading = false;
          this.errorMessage = err.message || 'Ocurrió un error al intentar recuperar la contraseña.';
        }
      });
  }
}