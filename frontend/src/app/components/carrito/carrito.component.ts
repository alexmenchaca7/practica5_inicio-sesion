import { Component, OnInit, AfterViewInit, ChangeDetectorRef, Inject, PLATFORM_ID, OnDestroy, NgZone } from '@angular/core'; // Añadir OnDestroy
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { CarritoService } from '../../services/carrito.service';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { Producto } from '../../models/producto';
import { forkJoin, of, lastValueFrom, Subscription } from 'rxjs'; // Añadir Subscription
import { catchError, map } from 'rxjs/operators';

declare var paypal: any;

interface ResultadoActualizacionStock {
  success: boolean;
  productoId: number;
  productoNombre: string;
  mensajeError?: string;
}

interface DetallesCompraParaModal {
  transactionId: string;
  totalPagado: number;
  itemsComprados: Producto[];
  reciboXML: string;
  fallosStock?: { productoNombre: string; mensajeError?: string }[];
}

@Component({
  selector: 'app-carrito',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
  templateUrl: './carrito.component.html',
  styleUrls: ['./carrito.component.css']
})
export class CarritoComponent implements OnInit, AfterViewInit, OnDestroy {
  private paypalButtonRendered = false; // Flag para saber si el botón YA está visible
  private paypalScriptLoading = false; // Flag para saber si el SCRIPT está cargando
  public carrito: Producto[] = []; // Hacerlo público si la plantilla necesita acceder directamente a su length fuera del *ngIf

  mostrarModalConfirmacion: boolean = false;
  detallesCompra: DetallesCompraParaModal | null = null;
  public errorPayPalInit = false;
  private carritoSubscription: Subscription | undefined;

  constructor(
    public carritoService: CarritoService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object,
    private zone: NgZone
  ) {}

  ngOnInit() {
    this.cargarCarritoConEfectos();
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      // Pequeño delay para asegurar que el DOM esté listo
      setTimeout(() => this.intentarRenderizarPayPal(), 0);
    }
  }

  ngOnDestroy(): void {
    if (this.carritoSubscription) {
      this.carritoSubscription.unsubscribe();
    }
  }

  cargarCarritoConEfectos() {
    this.carrito = this.carritoService.obtenerCarrito();
    // La detección de cambios se hará después de intentar renderizar PayPal para evitar conflictos
    if (isPlatformBrowser(this.platformId)) {
      this.intentarRenderizarPayPal();
    }
    this.cdr.detectChanges(); // Ejecutar detección de cambios después de la lógica de PayPal
  }

  intentarRenderizarPayPal() { // Nueva función centralizadora
    if (!isPlatformBrowser(this.platformId) || this.mostrarModalConfirmacion) {
      // No renderizar si no es browser o si el modal de confirmación está visible
      const payPalContainer = document.getElementById('paypal-button-container');
      if (payPalContainer && this.paypalButtonRendered) {
          payPalContainer.innerHTML = ''; // Limpiar si estaba renderizado y ya no debe estarlo
          this.paypalButtonRendered = false;
      }
      return;
    }

    const payPalContainer = document.getElementById('paypal-button-container');

    if (this.carrito.length > 0) { // Si hay items en el carrito
      if (payPalContainer) { // Si el contenedor existe
        if (!this.paypalButtonRendered && !this.paypalScriptLoading) {
          // Botón no renderizado y script no cargando: iniciar carga
          this.loadPayPalScript();
        } else if (typeof paypal !== 'undefined' && !this.paypalButtonRendered && !this.paypalScriptLoading) {
          // Script cargado (paypal existe), pero botones no renderizados (y script no está en proceso de carga): renderizar
          this.renderPayPalButton();
        }
        // Si paypalButtonRendered es true, no hacemos nada, ya está visible.
        // Si paypalScriptLoading es true, esperamos a que termine de cargar.
      } else {
        // Contenedor no encontrado, podría ser que *ngIf lo oculte.
        // No hacemos nada aquí, ngAfterViewInit o una llamada posterior a cargarCarritoConEfectos lo intentará de nuevo.
        console.warn("Contenedor PayPal no encontrado en intentarRenderizarPayPal. Se reintentará.");
      }
    } else { // Carrito vacío
      if (this.paypalButtonRendered && payPalContainer) {
        console.log("Carrito vacío, limpiando botones PayPal.");
        payPalContainer.innerHTML = '';
        this.paypalButtonRendered = false;
      }
    }
  }

  eliminarProducto(index: number) {
    this.carritoService.eliminarProducto(index);
    this.cargarCarritoConEfectos();
  }

  actualizarCantidad(index: number, cantidad: number | null) {
    const numCantidad = Number(cantidad);
    if (isNaN(numCantidad) || numCantidad < 0) {
      this.cargarCarritoConEfectos();
      return;
    }
    if (numCantidad === 0) {
        this.carritoService.eliminarProducto(index);
    } else {
        this.carritoService.actualizarCantidad(index, numCantidad);
    }
    this.cargarCarritoConEfectos();
  }

  descargarReciboDelModal() {
    if (!isPlatformBrowser(this.platformId) || !this.detallesCompra?.reciboXML) return;

    const blob = new Blob([this.detallesCompra.reciboXML], { type: 'application/xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `recibo_${this.detallesCompra.transactionId}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  calcularSubtotal(): number {
    return this.carrito.reduce((sub, prod) => sub + (prod.precio ?? 0) * (prod.cantidad ?? 0), 0);
  }
  calcularIVA(): number { return this.calcularSubtotal() * 0.16; }
  calcularTotal(): number { return this.calcularSubtotal() + this.calcularIVA(); }

  irAProductos(): void {
    this.router.navigate(['/productos']);
  }

  cerrarModalConfirmacionYRedirigir(): void {
    this.mostrarModalConfirmacion = false;
    this.detallesCompra = null;
    this.router.navigate(['/productos']);
  }

  private loadPayPalScript() {
    if (!isPlatformBrowser(this.platformId) || this.paypalScriptLoading) return;

    if (document.querySelector('script[src*="paypal.com/sdk/js"]')) {
      if (typeof paypal !== 'undefined') {
        this.renderPayPalButton();
      } else {
        setTimeout(() => this.loadPayPalScript(), 500); // Reintentar si el objeto paypal no está listo
      }
      return;
    }

    console.log("Cargando script de PayPal SDK...");
    this.paypalScriptLoading = true; // Marcar que el script está cargando
    this.errorPayPalInit = false;
    const clientId = 'ARN4q4xSLo9k19e845bV04QIgO1_gELqDi913C7UyJppQdNYZ_Wug1AIkttyJUCBoqwIIhCFlVLyf3KS';
    const script = document.createElement('script');
    // Usar la URL simplificada que funcionó para cargar el script
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=MXN&commit=true`;
    // Puedes añadir &disable-funding después si esta URL base funciona bien

    script.onload = () => {
      console.log('SDK de PayPal cargado.');
      this.paypalScriptLoading = false;
      // Ejecutar renderPayPalButton dentro de NgZone para asegurar que Angular se entere de los cambios
      this.zone.run(() => {
          this.renderPayPalButton();
      });
    };
    script.onerror = () => {
      console.error("Error CRÍTICO al cargar el SDK de PayPal desde la URL.");
      this.zone.run(() => {
        this.errorPayPalInit = true;
        this.paypalScriptLoading = false;
      });
    };  
    document.body.appendChild(script);
  }

  private renderPayPalButton() {
    if (!isPlatformBrowser(this.platformId)) return;

    if (typeof paypal === 'undefined') {
      if (!this.errorPayPalInit && !this.paypalScriptLoading) {
        console.warn('SDK de PayPal no listo (objeto paypal indefinido), reintentando carga del script...');
        this.loadPayPalScript(); // Intentar cargar el script de nuevo si no está cargando ya
      }
      return;
    }

    const container = document.getElementById('paypal-button-container');
    if (!container) {
      console.error('Contenedor de PayPal (#paypal-button-container) no encontrado.');
      this.paypalButtonRendered = false;
      return;
    }

    // Solo renderizar si:
    // 1. El botón NO está actualmente renderizado Y
    // 2. El carrito TIENE items Y
    // 3. El modal de confirmación NO está visible
    if (!this.paypalButtonRendered && this.carrito.length > 0 && !this.mostrarModalConfirmacion) {
        container.innerHTML = ''; // Limpiar ANTES de renderizar para evitar duplicados
        console.log("Intentando renderizar botones de PayPal...");

        paypal.Buttons({
          style: { layout: 'horizontal', color: 'gold', shape: 'rect', label: 'pay' },
          createOrder: (data: any, actions: any) => { /* ... sin cambios ... */ 
            if (this.carrito.length === 0) {
              alert("El carrito está vacío.");
              return Promise.reject(new Error("Carrito vacío"));
            }
            const total = this.calcularTotal();
            if (total <= 0) {
                alert("El total del pedido debe ser mayor a cero.");
                return Promise.reject(new Error("Total cero o negativo"));
            }
            return actions.order.create({
              purchase_units: [{
                amount: {
                  value: total.toFixed(2),
                  currency_code: 'MXN',
                  breakdown: {
                    item_total: { value: this.calcularSubtotal().toFixed(2), currency_code: 'MXN' },
                    tax_total: { value: this.calcularIVA().toFixed(2), currency_code: 'MXN' }
                  }
                },
                items: this.carrito.map((item: Producto) => ({
                  name: item.nombre.substring(0, 127),
                  unit_amount: { value: (item.precio ?? 0).toFixed(2), currency_code: 'MXN' },
                  quantity: (item.cantidad ?? 0).toString(),
                  sku: item.id.toString(),
                  category: 'PHYSICAL_GOODS'
                }))
              }]
            });
          },
          onApprove: async (data: any, actions: any) => { /* ... sin cambios en la lógica interna, pero revisa el final ... */ 
            try {
              const details = await actions.order.capture();
              console.log('Pago aprobado y capturado:', details);

              const itemsComprados = [...this.carrito];
              const totalPagado = this.calcularTotal();

              const actualizacionesObservables = itemsComprados.map(producto =>
                this.carritoService.actualizarInventario(
                  producto.id,
                  producto.cantidad ?? 0,
                  'restar'
                ).pipe(
                  map(() => ({ success: true, productoId: producto.id, productoNombre: producto.nombre })),
                  catchError(err => {
                    console.error(`Error actualizando stock para ${producto.nombre}:`, err);
                    return of({ success: false, productoId: producto.id, productoNombre: producto.nombre, mensajeError: err.message || String(err) });
                  })
                )
              );

              const resultadosStock = await lastValueFrom(forkJoin(actualizacionesObservables));
              const fallosStock = resultadosStock.filter(r => !r.success);

              // Pasar details.id a generarReciboXMLConItems
              const reciboXMLGenerado = this.generarReciboXMLConItems(itemsComprados, totalPagado, this.calcularIVAconItems(itemsComprados), details.id);

              this.detallesCompra = {
                transactionId: details.id,
                totalPagado: totalPagado,
                itemsComprados: itemsComprados,
                reciboXML: reciboXMLGenerado,
                fallosStock: fallosStock.length > 0 ? fallosStock.map(f => 'mensajeError' in f ? { productoNombre: f.productoNombre, mensajeError: f.mensajeError } : { productoNombre: f.productoNombre }) : undefined
              };

              if (fallosStock.length === 0) {
                this.carritoService.limpiarCarrito();
              } else {
                console.warn("Algunos productos no pudieron actualizar su stock. El carrito principal no se limpiará para revisión.");
              }
              
              this.mostrarModalConfirmacion = true;
              // Importante: Después de la compra, el botón de PayPal ya no debe estar activo en la vista principal.
              // La lógica de intentarRenderizarPayPal se encargará de limpiar el contenedor
              // si el carrito se vacía o si se muestra el modal.
              // No es necesario setear paypalButtonRendered a false aquí directamente,
              // la lógica de intentarRenderizarPayPal lo manejará.
              this.cargarCarritoConEfectos(); // Esto re-evaluará si se debe mostrar PayPal
              this.cdr.detectChanges();

            } catch (err: any) {
              console.error('Error completo en transacción PayPal (onApprove):', err);
              let mensajeError = 'Error al completar la transacción. ';
              if (err && err.message) {
                mensajeError += err.message;
              } else if (Array.isArray(err)) {
                  mensajeError += err.map(e => (e as any).message || String(e)).join(', ');
              }
              alert(mensajeError);
            }
          },
          onCancel: (data: any) => { /* ... */ },
          onError: (err: any) => { /* ... */ }
        }).render('#paypal-button-container').then(() => {
          this.paypalButtonRendered = true; // Se renderizó correctamente
          this.errorPayPalInit = false;
          console.log('Botones de PayPal renderizados.');
          this.cdr.detectChanges();
        }).catch((err: any) => {
          console.error("Error al renderizar los botones de PayPal:", err);
          this.errorPayPalInit = true;
          this.paypalButtonRendered = false;
          if (container) {
            container.innerHTML = '<p class="text-danger" style="color: red; text-align: center;">No se pudieron cargar las opciones de pago.</p>';
          }
          this.cdr.detectChanges();
        });
    } else if (this.carrito.length === 0 && this.paypalButtonRendered) {
        // Si el carrito está vacío pero el botón estaba renderizado, limpiarlo
        console.log("Carrito vacío, limpiando botones PayPal desde renderPayPalButton.");
        container.innerHTML = '';
        this.paypalButtonRendered = false;
    } else if (this.paypalButtonRendered) {
        console.log("Botón de PayPal ya renderizado, no se renderizará de nuevo.");
    }
  }

  private generarReciboXMLConItems(items: Producto[], total: number, iva: number, transactionId: string): string {
    const subtotal = total - iva;
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<recibo>\n`;
    xml += `  <tienda>${this.carritoService.tiendaNombre}</tienda>\n`;
    xml += `  <transactionId>${transactionId}</transactionId>\n`;
    xml += `  <fecha>${new Date().toISOString()}</fecha>\n`;
    xml += `  <productos>\n`;
    items.forEach((producto) => {
      xml += `    <producto id="${producto.id}">\n`;
      xml += `      <nombre>${this.escapeXml(producto.nombre)}</nombre>\n`;
      xml += `      <precio>${(producto.precio ?? 0).toFixed(2)}</precio>\n`;
      xml += `      <cantidad>${producto.cantidad ?? 0}</cantidad>\n`;
      xml += `    </producto>\n`;
    });
    xml += `  </productos>\n`;
    xml += `  <resumen>\n`;
    xml += `    <subtotal>${subtotal.toFixed(2)}</subtotal>\n`;
    xml += `    <iva>${iva.toFixed(2)}</iva>\n`;
    xml += `    <total>${total.toFixed(2)}</total>\n`;
    xml += `  </resumen>\n`;
    xml += `</recibo>`;
    return xml;
  }

  private calcularIVAconItems(items: Producto[]): number {
    const subtotal = items.reduce((sub, prod) => sub + (prod.precio ?? 0) * (prod.cantidad ?? 0), 0);
    return subtotal * 0.16;
  }

  private escapeXml(unsafe: string): string {
    if (typeof unsafe !== 'string') { return ''; }
    return unsafe.replace(/[<>&"']/g, function (c) {
      switch (c) {
        case '<': return '<';
        case '>': return '>';
        case '&': return '&';
        case '"': return '"';
        case '\'': return "'";
        default: return c;
      }
    });
  }
}