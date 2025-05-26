import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Producto } from '../models/producto';
import { InventarioService } from './inventario.service';
import { Observable, throwError, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class CarritoService {
  private carrito: Producto[] = [];
  private sessionId!: string;
  public tiendaNombre = 'Tienda de Gorras';
  private readonly CARTS_KEY = 'carritos';
  // Acceso a la URL base del servidor de imágenes (necesario para el HTML)
  public readonly serverBaseUrl: string;

  constructor(
    private inventarioService: InventarioService,
    @Inject(PLATFORM_ID) private platformId: Object // Inyecta PLATFORM_ID
  ) {
    // Obtenemos la URL base del servicio de inventario.
    // Asegúrate que InventarioService tenga una propiedad pública serverBaseUrl.
    this.serverBaseUrl = this.inventarioService.serverBaseUrl;

    this.obtenerSessionId();
    if (isPlatformBrowser(this.platformId)) {
      this.cargarCarrito();
    } else {
      this.carrito = [];
      console.log('SSR: Carrito inicializado vacío (localStorage no disponible).');
    }
  }

  private obtenerSessionId(): void {
    if (isPlatformBrowser(this.platformId)) {
      const storedSessionId = localStorage.getItem('session_id');
      if (storedSessionId) {
        this.sessionId = storedSessionId;
      } else {
        this.sessionId = this.generarSessionId();
        localStorage.setItem('session_id', this.sessionId);
      }
    } else {
      this.sessionId = this.generarSessionId();
      console.log('SSR: Session ID generado (localStorage no disponible).');
    }
  }

  private generarSessionId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  eliminarProducto(index: number) {
    if (index >= 0 && index < this.carrito.length) {
      const producto = this.carrito[index];
      const cantidadOriginal = producto.cantidad || 0; // Guardar cantidad antes de modificar

      if (producto.cantidad && producto.cantidad > 1) {
        producto.cantidad -= 1;
      } else {
        this.carrito.splice(index, 1);
      }

      // Solo actualiza inventario si el producto fue realmente afectado
      if (cantidadOriginal > 0) {
        this.actualizarInventario(producto.id, 1, 'sumar').subscribe({ // Sumar 1 al stock
          next: () => console.log(`Inventario sumado para ${producto.nombre} tras eliminación parcial/total del carrito.`),
          error: err => console.error(`Error al sumar al inventario para ${producto.nombre}: `, err.message || err)
        });
      }
      this.guardarCarrito();
    }
  }

  agregarProducto(producto: Producto) {
    const productoExistente = this.carrito.find(p => p.id === producto.id);
    if (productoExistente) {
      productoExistente.cantidad = (productoExistente.cantidad || 0) + 1;
    } else {
      // Asegurarse de que el producto que se añade al carrito tenga la ruta relativa de la imagen
      this.carrito.push(new Producto(
        producto.id,
        producto.nombre,
        1,
        producto.precio,
        producto.imagen // 'producto.imagen' debe ser la ruta relativa, ej: 'uploads/imagen.jpg'
      ));
    }
    this.actualizarInventario(producto.id, 1, 'restar').subscribe({ // Restar 1 del stock
        next: () => console.log(`Inventario restado para ${producto.nombre} tras agregar al carrito.`),
        error: err => console.error(`Error al restar del inventario para ${producto.nombre}: `, err.message || err)
    });
    this.guardarCarrito();
  }

  actualizarCantidad(index: number, nuevaCantidad: number) {
    if (index >= 0 && index < this.carrito.length && nuevaCantidad >= 0) {
      const producto = this.carrito[index];
      const cantidadAnteriorEnCarrito = producto.cantidad ?? 0;
      const diferencia = nuevaCantidad - cantidadAnteriorEnCarrito;

      if (nuevaCantidad === 0) {
        this.carrito.splice(index, 1);
      } else {
        producto.cantidad = nuevaCantidad;
      }

      if (diferencia !== 0) {
        this.actualizarInventario(producto.id, Math.abs(diferencia), diferencia > 0 ? 'restar' : 'sumar').subscribe({
            next: () => console.log(`Inventario actualizado para ${producto.nombre} por cambio de cantidad. Dif: ${diferencia}`),
            error: err => console.error(`Error al actualizar inventario para ${producto.nombre}: `, err.message || err)
        });
      }
      this.guardarCarrito();
    }
  }

  actualizarInventario(id: number, cantidadAfectada: number, operacion: 'sumar' | 'restar'): Observable<void> {
    return this.inventarioService.actualizarProductoCantidadServidor(id, cantidadAfectada, operacion).pipe(
      map(() => void 0),
      tap({
        next: () => console.log(`Inventario actualizado OK en servidor para producto ID ${id}. Op: ${operacion}, Cant: ${cantidadAfectada}`),
        error: (err: any) => console.error(`Error DENTRO DEL TAP de actualizarInventario para producto ID ${id}:`, err.message || err)
      }),
      catchError(error => {
        // Trata de obtener el nombre del producto si está en el carrito para un mejor mensaje.
        const productoEnCarrito = this.carrito.find(p => p.id === id);
        const nombreProducto = productoEnCarrito ? productoEnCarrito.nombre : `ID ${id}`;
        const errorMessage = (error instanceof Error) ? error.message : (typeof error === 'string' ? error : 'Error desconocido al actualizar inventario');
        console.error(`Error en catchError de actualizarInventario para ${nombreProducto}: ${errorMessage}`, error);
        return throwError(() => new Error(`Fallo al actualizar inventario para ${nombreProducto}: ${errorMessage}`));
      })
    );
  }

  obtenerCarrito(): Producto[] {
    // Si no estás en el navegador y el carrito no se cargó, esto devolverá el array vacío inicializado en el constructor
    return this.carrito;
  }


  generarXML(): string {
    let subtotal = this.calcularSubtotal();  // Calcular el subtotal
    let iva = subtotal * 0.16;  // Calcular el IVA (16%)
    let total = subtotal + iva;  // Calcular el total

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<recibo>\n`;
    xml += `  <tienda>${this.tiendaNombre}</tienda>\n`;
    this.carrito.forEach((producto) => {
      xml += `    <producto id="${producto.id}">\n`;
      xml += `      <nombre>${producto.nombre}</nombre>\n`;
      xml += `      <precio>${producto.precio}</precio>\n`;
      xml += `      <cantidad>${producto.cantidad}</cantidad>\n`;
    });
    xml += `  <subtotal>$${subtotal}</subtotal>\n`;
    xml += `  <iva>$${iva.toFixed(2)}</iva>\n`;  // Mostrar IVA con 2 decimales
    xml += `  <total>$${total.toFixed(2)}</total>\n`;  // Mostrar total con 2 decimales
    xml += `</recibo>`;

    return xml;
  }

  private calcularSubtotal(): number {
    return this.carrito.reduce((acc, producto) => acc + (producto.precio ?? 0) * (producto.cantidad ?? 0), 0); // Usar cantidad 0 si es undefined
  }

  private guardarCarrito(): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const carritosExistentes = localStorage.getItem(this.CARTS_KEY);
        const carritos = carritosExistentes ? JSON.parse(carritosExistentes) : {};
        // Guardar solo los datos necesarios, imagen es la ruta relativa
        carritos[this.sessionId] = this.carrito.map(p => ({
          id: p.id,
          nombre: p.nombre,
          cantidad: p.cantidad,
          precio: p.precio,
          imagen: p.imagen // ruta relativa
        }));
        localStorage.setItem(this.CARTS_KEY, JSON.stringify(carritos));
      } catch (e) {
        console.error("Error guardando carrito en localStorage:", e);
      }
    }
  }

  private cargarCarrito(): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const carritosData = localStorage.getItem(this.CARTS_KEY);
        if (carritosData) {
          const carritos = JSON.parse(carritosData);
          const carritoGuardado = carritos[this.sessionId];
          if (carritoGuardado && Array.isArray(carritoGuardado)) {
            this.carrito = carritoGuardado.map((item: any) =>
              new Producto( // Instanciar con los datos guardados
                item.id,
                item.nombre,
                item.cantidad,
                Number(item.precio),
                item.imagen // ruta relativa
              )
            );
          } else { this.carrito = []; }
        } else { this.carrito = []; }
      } catch (e) {
        console.error("Error cargando carrito de localStorage:", e);
        this.carrito = [];
      }
    }
  }

  limpiarCarrito() {
    this.carrito = [];
    this.guardarCarrito(); // Guardar el carrito vacío
  }
}
