(function(lls) {
	var storage = new lls({
		size: 10 * 1024 * 1024,
		name: 'lls-test'
		// forceProvider: 'WebSQL' // force a desired provider.
	});

	// for debug
	// window.storage = storage;

	function getAttachment(a, cb) {
        var xhr = new XMLHttpRequest(),
            blob;

        xhr.open("GET", a, true);
        var is_safari = navigator.userAgent.indexOf("Safari") > -1;
        if (is_safari) {
        	xhr.responseType = "arraybuffer";
        } else {
        	xhr.responseType = "blob";
        }

        xhr.addEventListener("load", function () {
            if (xhr.status === 200) {
            	if (is_safari) {
            		blob = new Blob([xhr.response], {type: 'image/jpeg'});
            	} else {
            		blob = xhr.response;
            	}
                cb(blob);
            }
        }, false);
        xhr.send();
    }

	describe('LargeLocalStorage', function() {
		it('Allows string contents to be set and read', function(done) {
			storage.setContents("testFile", "contents").then(function() {
				return storage.getContents("testFile");
			}).then(function(contents) {
				expect(contents).to.equal("contents");
			}).done(done);
		});

		it('Allows js objects to be set and read', function(done) {
			var jsondoc = {
				a: 1,
				b: 2,
				c: {a: true}
			};
			storage.setContents("testfile2", jsondoc, {json:true}).then(function() {
				return storage.getContents("testfile2", {json:true});
			}).then(function(contents) {
				expect(jsondoc).to.eql(contents);
			}).done(done);
		});

		it('Allows items to be deleted', function(done) {
			storage.setContents("testfile3", "contents").then(function() {
				return storage.rm("testfile3");
			}).then(function() {
				return storage.getContents("testfile3");
			}).then(function(contents) {
				expect(contents).to.equal(undefined);
			}).done(done);
		});


		it('Allows attachments to be written, read', function(done) {
			getAttachment("elephant.jpg", function(blob) {
				storage.setContents("testfile4", "file...").then(function() {
					return storage.setAttachment("testfile4", "ele", blob);
				}).then(function() {
					return storage.getAttachment("testfile4", "ele");
				}).then(function(attach) {
					expect(attach instanceof Blob).to.equal(true);
				}).done(done);
			});
		});


		// Apparently these tests are being run sequentially...
		// so taking advantage of that.
		it('Allows us to get attachments as urls', function(done) {
			storage.getAttachmentURL("testfile4", "ele").then(function(url) {
				// urls are pretty opaque since they could be from
				// filesystem api, indexeddb, or websql
				// meaning there isn't much we can do to verify them
				// besides ensure that they are strings.
				expect(typeof url === 'string').to.equal(true);
				$(document.body).append('<img src="' + url + '">');
			}).done(done);
		});

		it('Allows attachments to be deleted', function(done) {
			storage.rmAttachment("testfile4", "ele").then(function() {
				// .done will throw any errors and fail the test for us if 
				// something went wrong.
			}).done(done);
		});

		it('Removes all attachments when removing a file', function(done) {
			getAttachment("pie.jpg", function(blob) {
				storage.setContents("testfile5", "fileo").then(function() {
					return storage.setAttachment("testfile5", "pie", blob);
				}).then(function() {
					return storage.setAttachment("testfile5", "pie2", blob);
				}).then(function() {
					return storage.rm("testfile5");
				}).then(function() {
					return storage.getAttachment("testfile5", "pie");
				}).then(function(val) {
					expect(val).to.equal(undefined);

					storage.getAttachment("testfile5", "pie2")
					.then(function(a) {
						expect(a).to.equal(undefined);
					}).done(done);
				}).done();
			});
		});

		it('Allows one to revoke attachment urls', function() {
			storage.revokeAttachmentURL('');
		});

		it('Allows all attachments to be gotten in one shot', function(done) {
			var c = countdown(2, continuation);
			getAttachment("pie.jpg", function(pie) {
				c(pie);
			});

			getAttachment("elephant.jpg", function(ele) {
				c(ele);
			});

			function continuation(blob1, blob2) {
				Q.all([
					storage.setAttachment("testfile6", "blob1", blob1),
					storage.setAttachment("testfile6", "blob2", blob2)
				]).then(function() {
					return storage.getAllAttachments("testfile6");
				}).then(function(attachments) {
					expect(attachments.length).to.equal(2);
					expect(attachments[0].docKey).to.equal('testfile6');
					expect(attachments[1].docKey).to.equal('testfile6');
					expect(attachments[0].attachKey.indexOf('blob')).to.equal(0);
					expect(attachments[1].attachKey.indexOf('blob')).to.equal(0);
				}).done(done);
			}
		});

		it('Allows all attachment urls to be gotten in one shot', function(done) {
			storage.getAllAttachmentURLs('testfile6').then(function(urls) {
				expect(urls.length).to.equal(2);
				urls.forEach(function(url) {
					$(document.body).append('<img src="' + url.url + '"></img>');
				});
			}).done(done);
		});


		it('Allows us to ls the attachments on a document', function(done) {
			storage.ls('testfile6').then(function(listing) {
				expect(listing.length).to.equal(2);
				expect(listing[0] == 'blob1' || listing[0] == 'blob2').to.equal(true);
				expect(listing[1] == 'blob1' || listing[1] == 'blob2').to.equal(true);
			}).done(done);
		});

		// TODO: create a new db to test on so this isn't
		// broken when updating other tests
		it('Allows us to ls for all docs', function(done) {
			storage.ls().then(function(listing) {
				expect(listing.indexOf('testfile4')).to.not.equal(-1);
				expect(listing.indexOf('testFile')).to.not.equal(-1);
				expect(listing.indexOf('testfile2')).to.not.equal(-1);
				expect(listing.length).to.equal(3);
			}).done(done);
		});

		it('Allows us to clear out the entire storage', function(done) {
			storage.clear().then(function() {
				var scb = countdown(2, function(value) {
					if (value != undefined)
						throw new Error('Files were not removed.');
					done();
				});

				var ecb = function(err) {
					throw new Error('getting missing documents should not return an error');
				};

				storage.getContents('testfile4').then(scb, ecb);
				storage.getContents('testfile2').then(scb, ecb);
			}).done();
		});

		describe('Data Migration', function() {
			it('Allows us to copy data when the implementation changes', function(done) {
				getAvailableImplementations().then(function() {

				});
				storage = new lls({
					name: 'lls-migration-test',
					forceProvider: 'WebSQL'
				});
			});
		});
	});

	function getAvailableImplementations() {
		
	}


	storage.initialized.then(function() {
		storage.clear().then(function() {
			window.runMocha();
		}).catch(function(err) {
			console.log(err);
		});
	}, function(err) {
		console.log(err);
		alert('Could not initialize storage.  Did you not authorize it? ' + err);
	});
})(LargeLocalStorage);