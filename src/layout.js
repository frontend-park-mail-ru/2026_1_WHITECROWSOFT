import { Sidebar } from "./components/sidebar/sidebar.js";
import { store } from "./store";
import Handlebars from 'handlebars';
import layoutTemplate from './layout.hbs?raw';

export class Layout {
    constructor () {
        this.sidebar = null;
        this.mainContainer = null;
    }

    async init() {
        this._render();
        this.sidebar = new Sidebar('sidebarContainer');
        await this.sidebar.init();
        this._subscribeToStore();
    }

    _render() {
        const app = document.querySelector('#app');
        if (!app) return;
        const template = Handlebars.compile(layoutTemplate);
        app.innerHTML = template({});
        this.mainContainer = document.getElementById('mainContainer');
    }

    _subscribeToStore(){
        store.subscribe('notes', (notes) => {
            this.sidebar._updateNotes(notes);
        });

        store.subscribe('activeNoteId', (noteId) => {
            this.sidebar._setActiveNote(noteId);
        });

        store.subscribe('user', (user) => {
            this.sidebar._updateUser(user);
        });
    }

    async setPage(pageModule, pageData = {}) {
        try {
            this.mainContainer.innerHTML = '';
            const page = document.createElement('div');
            page.className = 'note';
            this.mainContainer.appendChild(page);
            if (pageModule){
                await pageModule(page, pageData);
            }
        } catch (error) {
            console.error('[Layout] error', error);
        }
    }

    getSidebar() {
        return this.sidebar;
    }
}