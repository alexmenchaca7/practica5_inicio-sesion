import { Component, OnInit, OnDestroy } from '@angular/core'; // Añadir OnDestroy
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../header/header.component';
import { Producto } from '../../models/producto';
import { InventarioService } from '../../services/inventario.service';
import { CarritoService } from '../../services/carrito.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs'; // Para desuscripciones

@Component({
  selector: 'app-producto',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
  templateUrl: './producto.component.html',
  styleUrls: ['./producto.component.css']
})
export class ProductoComponent implements OnInit, OnDestroy {
  // Esperar el tipo que incluye displayUrl del servicio
  productos: (Producto & { displayUrl?: string })[] = [];
  private productosSub: Subscription | undefined;

  mensajeExito: boolean = false;
  mensajeError: string | null = null;

  constructor(
    public inventarioService: InventarioService, // Público para acceder a serverBaseUrl si fuera necesario
    private carritoService: CarritoService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // obtenerProductos() ya emite productos con displayUrl
    this.productosSub = this.inventarioService.obtenerProductos().subscribe({
      next: (productosConDisplayUrl) => {
        this.productos = productosConDisplayUrl;
      },
      error: (error) => {
        console.error('ProductoComponent: Error al cargar productos:', error);
        // Considera mostrar un mensaje al usuario aquí también
        this.mensajeError = `Error al cargar productos: ${error.message || 'Error desconocido'}`;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.productosSub) {
      this.productosSub.unsubscribe();
    }
  }

  agregarAlCarrito(producto: Producto & { displayUrl?: string }): void {
    // El CarritoService espera un objeto Producto (sin displayUrl explícitamente, aunque no daña si está)
    // La propiedad 'imagen' del producto original (la ruta relativa) es la que debe usarse.
    if (producto.cantidad && producto.cantidad > 0) {
      // Creamos una instancia limpia de Producto para el carrito, usando la 'imagen' original
      const productoParaCarrito = new Producto(
        producto.id,
        producto.nombre,
        1, // Cantidad a agregar al carrito
        producto.precio,
        producto.imagen // Ruta relativa original
      );
      this.carritoService.agregarProducto(productoParaCarrito);
      this.mensajeExito = true;
      setTimeout(() => {
        this.mensajeExito = false;
      }, 3000);
    } else {
      this.mensajeError = 'Producto agotado!';
      setTimeout(() => {
        this.mensajeError = null;
      }, 3000);
    }
  }

  irAlCarrito(): void {
    this.router.navigate(['/carrito']);
  }

  irAlInventario(): void {
    this.router.navigate(['/inventario']);
  }
}