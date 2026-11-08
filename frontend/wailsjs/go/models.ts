export namespace pdfcomposer {
	
	export class PageSpec {
	    sourceId: string;
	    pageNumber: number;
	    rotation: number;
	
	    static createFrom(source: any = {}) {
	        return new PageSpec(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceId = source["sourceId"];
	        this.pageNumber = source["pageNumber"];
	        this.rotation = source["rotation"];
	    }
	}
	export class ExportRequest {
	    outputPath: string;
	    pages: PageSpec[];
	
	    static createFrom(source: any = {}) {
	        return new ExportRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.outputPath = source["outputPath"];
	        this.pages = this.convertValues(source["pages"], PageSpec);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SourcePDF {
	    id: string;
	    filePath: string;
	    fileName: string;
	    pageCount: number;
	
	    static createFrom(source: any = {}) {
	        return new SourcePDF(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.filePath = source["filePath"];
	        this.fileName = source["fileName"];
	        this.pageCount = source["pageCount"];
	    }
	}

}

