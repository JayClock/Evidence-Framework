package com.evidencepoc.backend.api.representation;

import com.evidencepoc.backend.api.ApiTemplates;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;

public final class RootModel extends RepresentationModel<RootModel> {
  public RootModel(UriInfo uriInfo) {
    add(Link.of(ApiTemplates.relative(ApiTemplates.root(uriInfo))).withSelfRel());
    add(Link.of(ApiTemplates.relative(ApiTemplates.users(uriInfo)), "users"));
  }
}
